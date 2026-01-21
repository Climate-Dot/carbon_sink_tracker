"""
One-time script to pre-generate GeoJSON files from Azure SQL database.
This eliminates runtime WKT conversion overhead.

Usage: python generate_lulc_files.py

Output: static/lulc/{year}/district_{id}.geojson
"""

import os
import json
import time
from pathlib import Path
from dotenv import load_dotenv
import pyodbc
from shapely import wkt
from shapely.geometry import mapping

# Load environment variables
env_path = os.path.join(os.path.dirname(__file__), "credentials.env")
load_dotenv(env_path)

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

def get_connection():
    """Create and return SQL Server connection."""
    conn_str = (
        f"DRIVER={{ODBC Driver 18 for SQL Server}};"
        f"SERVER={DB_HOST},{DB_PORT};"
        f"DATABASE={DB_NAME};"
        f"UID={DB_USER};"
        f"PWD={DB_PASSWORD};"
        "Encrypt=YES;"
        "TrustServerCertificate=NO;"
        "Connection Timeout=30;"
        "Command Timeout=300;"  # Increased for large queries
    )
    return pyodbc.connect(conn_str)

def create_output_directories(base_path, years):
    """Create directory structure for output files."""
    base_dir = Path(base_path)
    base_dir.mkdir(parents=True, exist_ok=True)
    
    for year in years:
        year_dir = base_dir / str(year)
        year_dir.mkdir(exist_ok=True)
        print(f"Created directory: {year_dir}")
    
    return base_dir

def get_all_years(conn):
    """Fetch all available years from the database."""
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT year FROM fact_lulc_stats ORDER BY year")
    years = [row[0] for row in cursor.fetchall()]
    cursor.close()
    return years

def get_all_districts(conn):
    """Fetch all district IDs and names from the database."""
    cursor = conn.cursor()
    cursor.execute("SELECT id, name FROM district_boundaries ORDER BY id")
    districts = [(row[0], row[1]) for row in cursor.fetchall()]
    cursor.close()
    return districts

def generate_geojson_for_district_year(conn, district_id, district_name, year, output_path):
    """
    Generate GeoJSON file for a specific district and year.
    Uses Reduce() in SQL to simplify geometries before fetching.
    """
    output_file = output_path / str(year) / f"district_{district_id}.geojson"
    if output_file.exists():
        print(f"  {district_name} ({year}): skipped (file already exists)")
        return 0, 0

    cursor = conn.cursor()
    
    # Query with geometry simplification in SQL
    # MakeValid() fixes invalid geometries before Reduce()
    # Reduce() works with Azure SQL Geography types
    query = """
        SELECT 
            district_id,
            year,
            type_id,
            area,
            geometry.MakeValid().Reduce(0.0003).STAsText() AS geometry_wkt
        FROM fact_lulc_stats
        WHERE district_id = ?
        AND year = ?
        ORDER BY area DESC
    """
    
    start_time = time.time()
    cursor.execute(query, [district_id, year])
    rows = cursor.fetchall()
    query_time = time.time() - start_time
    
    if not rows:
        cursor.close()
        return 0, query_time
    
    # Convert WKT to GeoJSON
    features = []
    parse_start = time.time()
    
    for row in rows:
        district_id_val, year_val, type_id_val, area_val, wkt_geom = row
        
        try:
            geom = wkt.loads(wkt_geom) if wkt_geom else None
            geometry = mapping(geom) if geom else None
            
            feature = {
                "type": "Feature",
                "geometry": geometry,
                "properties": {
                    "district_id": district_id_val,
                    "year": year_val,
                    "type_id": type_id_val,
                    "area": float(area_val) if area_val else 0.0
                },
            }
            features.append(feature)
        except Exception as e:
            print(f"  WARNING: Error processing geometry: {e}")
            continue
    
    parse_time = time.time() - parse_start
    
    # Create GeoJSON FeatureCollection
    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    
    # Write to file
    with open(output_file, 'w') as f:
        json.dump(geojson, f, separators=(',', ':'))  # Compact JSON
    
    file_size = os.path.getsize(output_file) / 1024  # KB
    cursor.close()
    
    total_time = query_time + parse_time
    print(f"  {district_name} ({year}): {len(features)} features, {file_size:.1f} KB, {total_time:.2f}s")
    
    return len(features), total_time

def main():
    """Main function to generate all GeoJSON files."""
    print("=" * 70)
    print("LULC GeoJSON Pre-Generation Script")
    print("=" * 70)
    
    # Output directory
    output_base = Path(__file__).parent.parent / "static" / "lulc"
    
    print("\nConnecting to database...")
    conn = get_connection()
    print("Connected to Azure SQL")
    
    # Get all years and districts
    print("\nFetching available years...")
    years = get_all_years(conn)
    print(f"Found {len(years)} years: {years}")
    
    print("\nFetching districts...")
    districts = get_all_districts(conn)
    print(f"Found {len(districts)} districts")
    
    # Create directory structure
    print(f"\nCreating directory structure at: {output_base}")
    create_output_directories(output_base, years)
    
    # Generate files
    print(f"\nGenerating GeoJSON files...")
    print(f"Total files to generate: {len(years) * len(districts)}")
    print("-" * 70)
    
    total_features = 0
    total_time = 0
    file_count = 0
    
    for year in years:
        print(f"\nYear {year}:")
        year_start = time.time()
        
        for district_id, district_name in districts:
            features, gen_time = generate_geojson_for_district_year(
                conn, district_id, district_name, year, output_base
            )
            total_features += features
            total_time += gen_time
            file_count += 1
        
        year_time = time.time() - year_start
        print(f"  Year {year} completed in {year_time:.2f}s")
    
    # Summary
    print("\n" + "=" * 70)
    print("Generation Complete!")
    print("=" * 70)
    print(f"Files generated: {file_count}")
    print(f"Total features: {total_features:,}")
    print(f"Total time: {total_time:.2f}s")
    print(f"Average time per file: {total_time/file_count:.2f}s")
    
    # Calculate total directory size
    total_size = sum(
        f.stat().st_size 
        for f in output_base.rglob("*.geojson")
    ) / (1024 * 1024)  # MB
    print(f"Total size: {total_size:.2f} MB")
    print(f"\nOutput location: {output_base.absolute()}")
    
    conn.close()
    print("\nAll done! You can now restart the FastAPI server.")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nGeneration interrupted by user")
    except Exception as e:
        print(f"\n\nError: {e}")
        import traceback
        traceback.print_exc()

