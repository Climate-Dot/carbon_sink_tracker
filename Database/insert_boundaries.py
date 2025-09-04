import os
import pyodbc
import geopandas as gpd
from dotenv import load_dotenv

# Load env file
load_dotenv("D:/ClimateDot/CarbonSink/Backend/credentials.env")

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")


# Database connection
def get_connection():
    return pyodbc.connect(
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER={DB_HOST},{DB_PORT};"
        f"DATABASE={DB_NAME};"
        f"UID={DB_USER};"
        f"PWD={DB_PASSWORD};"
        "TrustServerCertificate=yes;"
    )


def insert_state_boundaries(shp_path, name_column):
    # Read shapefile
    gdf = gpd.read_file(shp_path)

    # Ensure CRS is WGS84
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    else:
        gdf = gdf.to_crs("EPSG:4326")

    conn = get_connection()
    cursor = conn.cursor()

    for _, row in gdf.iterrows():
        state_name = row[name_column]
        geom_wkb = row.geometry.wkb  # store as WKB (geometry)

        # Check if record already exists by state name
        cursor.execute(
            "SELECT COUNT(*) FROM state_boundaries WHERE name = ?", state_name
        )
        exists = cursor.fetchone()[0]

        if exists == 0:
            cursor.execute(
                "INSERT INTO state_boundaries (name, geom) VALUES (?, geometry::STGeomFromWKB(?, 4326))",
                (state_name, geom_wkb),
            )
            print(f"✅ Inserted {state_name}")
        else:
            print(f"⏩ Skipped {state_name} (already exists)")

    conn.commit()
    cursor.close()
    conn.close()
    print("🎉 Done inserting state boundaries.")


def insert_district_boundaries(shp_path, name_column, id_column, state_id_mapping=None):
    """
    Insert districts from a shapefile into SQL Server.

    :param shp_path: Path to the shapefile
    :param name_column: Column in shapefile that contains district names
    :param id_column: Column in shapefile that contains district IDs (Dist_LGD)
    :param state_id_mapping: Optional dict to map state names to state_id in DB
    """
    # Read shapefile
    gdf = gpd.read_file(shp_path)

    # Ensure CRS is WGS84
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    else:
        gdf = gdf.to_crs("EPSG:4326")

    conn = get_connection()
    cursor = conn.cursor()

    for _, row in gdf.iterrows():
        try:
            district_id = int(row[id_column])       # 👈 take from Dist_LGD
            district_name = row[name_column]
            area = row.geometry.area
            geom_wkb = row.geometry.wkb
            state_id = 2  # Gujarat (or lookup via mapping if needed)

            # Check if district exists
            cursor.execute(
                "SELECT COUNT(*) FROM district_boundaries WHERE id = ?", district_id
            )
            exists = cursor.fetchone()[0]

            if exists == 0:
                cursor.execute(
                    """
                    SET IDENTITY_INSERT district_boundaries ON;
                    INSERT INTO district_boundaries (id, name, area, state_id, geom)
                    VALUES (?, ?, ?, ?, geometry::STGeomFromWKB(?, 4326));
                    SET IDENTITY_INSERT district_boundaries OFF;
                    """,
                    (district_id, district_name, area, state_id, geom_wkb),
                )
                print(f"✅ Inserted {district_name} (ID={district_id})")
            else:
                print(f"⏩ Skipped {district_name} (already exists, ID={district_id})")

        except Exception as e:
            print(f"❌ Error inserting {row[name_column]}: {e}")

    conn.commit()
    cursor.close()
    conn.close()
    print("🎉 Done inserting district boundaries.")

if __name__ == "__main__":
    insert_state_boundaries(
        shp_path="D:/ClimateDot/State_District_boundary/State Boundary/Gujarat_state.shp",
        name_column="STATE",  # attribute column in your shapefile
    )

    state_id_mapping = {
        "GUJARAT": 2,  # Example, replace with actual IDs from state_boundaries table
        # Add other states if needed
    }

    insert_district_boundaries(
        shp_path="D:/ClimateDot/State_District_boundary/District Boundary/Gujarat_district.shp",
        name_column="DISTRICT",  # Attribute column in your shapefile
        state_id_mapping=state_id_mapping,
        id_column="Dist_LGD" 
    )
