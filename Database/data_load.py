import json
import pyodbc
import os
import glob
from shapely.geometry import shape
from shapely import wkt
from pathlib import Path
from dotenv import load_dotenv
import time
import uuid

# Load env file
load_dotenv("D:/ClimateDot/CarbonSink/Backend/credentials.env")

# Configuration
DOWNLOADS_2020_PATH = "D:/ClimateDot/Exports/2014_dissolved"
GEOJSON_PATTERN = "LULC_Vector_*.geojson"
BATCH_SIZE = 1000


# Database connection string - pull from environment variables
def get_connection_string():
    """Build connection string from environment variables"""
    DB_NAME = os.getenv("DB_NAME")
    DB_USER = os.getenv("DB_USER")
    DB_PASSWORD = os.getenv("DB_PASSWORD")
    DB_HOST = os.getenv("DB_HOST")
    DB_PORT = os.getenv("DB_PORT")

    if not DB_PASSWORD:
        raise ValueError("DB_PASSWORD environment variable is required")

    return (
        f"DRIVER={{ODBC Driver 18 for SQL Server}};"
        f"SERVER={DB_HOST},{DB_PORT};"
        f"DATABASE={DB_NAME};"
        f"UID={DB_USER};"
        f"PWD={DB_PASSWORD};"
        "Encrypt=yes;"
        "TrustServerCertificate=no;"
        "Connection Timeout=60;"
        "Login Timeout=60;"
        "LongAsMax=True;"
    )


def get_geojson_files():
    """Get all GeoJSON files from the downloads/2020 folder"""
    pattern = os.path.join(DOWNLOADS_2020_PATH, GEOJSON_PATTERN)
    files = glob.glob(pattern)
    print(f"Found {len(files)} GeoJSON files in {DOWNLOADS_2020_PATH}")
    return sorted(files)


def extract_district_name(filename):
    """Extract district name from filename"""
    # Remove path and extension, then extract district name
    basename = os.path.basename(filename)
    district_name = basename.replace("LULC_Vector_", "").replace(".geojson", "")
    return district_name


def get_district_year_from_file(file_path):
    """Read first feature to determine district_id and year for existence check."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not data.get("features"):
            return None, None
        props = data["features"][0].get("properties", {})
        year = props.get("year", props.get("year_x"))
        district_id = props.get("district_id")
        return district_id, year
    except Exception as e:
        print(f"  Warning: could not read year/district from {file_path}: {e}")
        return None, None


def data_exists_for_district_year(cursor, district_id, year):
    """Check if data already exists for a district/year combination."""
    if district_id is None or year is None:
        return False
    try:
        cursor.execute(
            "SELECT COUNT(1) FROM fact_lulc_stats WHERE year = ? AND district_id = ?",
            (year, district_id),
        )
        count = cursor.fetchone()[0]
        return count > 0
    except Exception as e:
        print(f"  Warning: existence check failed for district {district_id}, year {year}: {e}")
        return False


def batch_insert_features(cursor, batch_data):
    """Insert a batch of features using executemany for better performance"""
    if not batch_data:
        return 0

    insert_query = """
        INSERT INTO fact_lulc_stats
        (id, area, year, type_id, district_id, count_val, landcover, geometry)
        VALUES (?, ?, ?, ?, ?, ?, ?, geography::STGeomFromText(CAST(? AS NVARCHAR(MAX)), 4326))
    """

    try:
        cursor.executemany(insert_query, batch_data)
        return len(batch_data)
    except Exception as e:
        print(f"  Batch insert error: {e}")
        return 0


def process_geojson_file(file_path, cursor, district_name):
    """Process a single GeoJSON file and insert data into database (batched)"""
    try:
        print(f"Processing {district_name}...")

        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        features_processed = 0
        batch_data = []

        for feature in data["features"]:
            try:
                props = feature["properties"]
                geom = shape(feature["geometry"])
                wkt_geom = geom.wkt
                year = props.get("year_x")

                feature_tuple = (
                    # feature.get("id", f"{district_name}_{features_processed}"),
                    str(uuid.uuid4()),
                    props.get("area", 0),
                    props.get("year", year),
                    props.get("type_id", 0),
                    props.get("district_id", 0),
                    props.get("count", 0),
                    props.get("landcover", ""),
                    wkt_geom,
                )

                batch_data.append(feature_tuple)
                features_processed += 1

                if len(batch_data) >= BATCH_SIZE:
                    inserted = batch_insert_features(cursor, batch_data)
                    if inserted > 0:
                        print(f"  Inserted batch of {inserted} features")
                    batch_data = []

            except Exception as feature_error:
                print(
                    f"  Error processing feature {features_processed} in {district_name}: {feature_error}"
                )
                continue

        # Flush remaining
        if batch_data:
            inserted = batch_insert_features(cursor, batch_data)
            if inserted > 0:
                print(f"  Inserted final batch of {inserted} features")

        print(
            f"  Successfully prepared {features_processed} features from {district_name}"
        )
        return features_processed

    except Exception as e:
        print(f"  Error processing file {file_path}: {e}")
        return 0


def safe_commit(conn, retries=3, delay_seconds=2):
    """Commit with simple retry to handle transient link failures"""
    for attempt in range(1, retries + 1):
        try:
            conn.commit()
            return True
        except Exception as e:
            print(f"Commit failed (attempt {attempt}/{retries}): {e}")
            if attempt == retries:
                return False
            time.sleep(delay_seconds)


def main():
    """Main function to process all GeoJSON files"""
    # Check required environment variables
    required_env_vars = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"]
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    if missing_vars:
        print(f"Error: Missing required environment variables: {missing_vars}")
        return

    geojson_files = get_geojson_files()

    if not geojson_files:
        print(f"No GeoJSON files found in {DOWNLOADS_2020_PATH}")
        return

    # Connect to Azure SQL
    try:
        connection_string = get_connection_string()
        conn = pyodbc.connect(connection_string)
        conn.autocommit = False
        cursor = conn.cursor()
        cursor.setinputsizes([(pyodbc.SQL_WVARCHAR, 0, 0)])
        cursor.fast_executemany = True
        print("Connected to database successfully")
    except Exception as e:
        print(f"Database connection failed: {e}")
        return

    total_features = 0
    successful_files = 0

    try:
        # Process each file and commit per file to reduce transaction size
        for file_path in geojson_files:
            district_name = extract_district_name(file_path)
            district_id, year = get_district_year_from_file(file_path)
            if data_exists_for_district_year(cursor, district_id, year):
                print(f"Skipping {district_name} (district_id={district_id}, year={year}) - already loaded")
                continue
            features_processed = process_geojson_file(file_path, cursor, district_name)

            if features_processed > 0:
                if not safe_commit(conn):
                    raise RuntimeError("Commit failed after retries")
                successful_files += 1
                total_features += features_processed
                print(f"  Committed {district_name}")

        print(f"\nProcessing complete!")
        print(f"Successfully processed {successful_files}/{len(geojson_files)} files")
        print(f"Total features inserted: {total_features}")

    except Exception as e:
        print(f"Error during processing: {e}")
        try:
            conn.rollback()
        except Exception as rb_e:
            print(f"Rollback failed: {rb_e}")
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass
        print("Database connection closed")


if __name__ == "__main__":
    main()
