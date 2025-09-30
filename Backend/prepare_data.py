import geopandas as gpd
import json
import pyodbc
import os
from shapely import wkt
from shapely.geometry import mapping
from dotenv import load_dotenv

# Load credentials
print("🔑 Loading credentials...")
load_dotenv("D:/ClimateDot/CarbonSink/Backend/credentials.env")

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")


def get_connection():
    conn_str = (
        f"DRIVER={{ODBC Driver 18 for SQL Server}};"
        f"SERVER={DB_HOST},{DB_PORT};"
        f"DATABASE={DB_NAME};"
        f"UID={DB_USER};"
        f"PWD={DB_PASSWORD};"
        "TrustServerCertificate=Yes;"
    )
    return pyodbc.connect(conn_str)


# ---- Village boundary ----
# print("📍 Loading village boundary shapefile...")
# village_gdf = gpd.read_file(
#     "D:/ClimateDot/State_District_boundary/Village Boundary/Teritorial Circle_Village_Boundary.shp"
# )
# village_gdf = village_gdf.to_crs(epsg=4326)
# with open("cache_village_boundary.geojson", "w") as f:
#     json.dump(json.loads(village_gdf.to_json()), f)
# print("✅ Village boundary cached.")

# ---- State + District from DB ----
print("🔗 Connecting to database...")
conn = get_connection()
cur = conn.cursor()
print("✅ Database connection established.")

# State boundaries
print("🌍 Caching state boundaries...")
cur.execute("SELECT name, geom.STAsText() FROM state_boundaries ORDER BY name;")
state_features = []
for i, (name, geom_wkt) in enumerate(cur.fetchall(), start=1):
    geom = wkt.loads(geom_wkt)
    state_features.append(
        {"type": "Feature", "geometry": mapping(geom), "properties": {"name": name}}
    )
    if i % 50 == 0:
        print(f"   Processed {i} state geometries...")
with open("cache_state_boundary.geojson", "w") as f:
    json.dump({"type": "FeatureCollection", "features": state_features}, f)
print(f"✅ State boundaries cached: {len(state_features)} features.")


# District boundaries
print("🏙️ Caching district boundaries...")
cur.execute("SELECT id, name, geom.STAsText(), state_id FROM district_boundaries ORDER BY name;")
district_features = []
for i, (id_, name, geom_wkt, state_id) in enumerate(cur.fetchall(), start=1):
    geom = wkt.loads(geom_wkt)
    district_features.append(
        {
            "type": "Feature",
            "geometry": mapping(geom),
            "properties": {"id": id_, "name": name, "state_id": state_id},
        }
    )
    if i % 200 == 0:
        print(f"   Processed {i} district geometries...")
with open("cache_district_boundary.geojson", "w") as f:
    json.dump({"type": "FeatureCollection", "features": district_features}, f)
print(f"✅ District boundaries cached: {len(district_features)} features.")


# District names
print("📋 Caching district names...")
cur.execute("SELECT DISTINCT name FROM district_boundaries ORDER BY name;")
districts = [row[0] for row in cur.fetchall()]
with open("cache_districts.json", "w") as f:
    json.dump(districts, f)
print(f"✅ District names cached: {len(districts)} names.")


# Gujarat LULC (year 2020 only for now)
print("🗺️ Caching Gujarat LULC (2020)...")
cur.execute("""
    SELECT district_id, year, type_id, geometry.STAsText() AS wkt_geometry
    FROM fact_lulc_stats
    WHERE year = 2015
""")
rows = cur.fetchall()
columns = [col[0] for col in cur.description]
features = []
for i, row in enumerate(rows, start=1):
    row_dict = dict(zip(columns, row))
    wkt_geom = row_dict.pop("wkt_geometry")
    geom = wkt.loads(wkt_geom).simplify(500.0, preserve_topology=True) if wkt_geom else None
    features.append(
        {"type": "Feature", "geometry": mapping(geom) if geom else None, "properties": row_dict}
    )
    if i % 500 == 0:
        print(f"   Processed {i}/{len(rows)} LULC geometries...")
with open("cache_lulc_2020.geojson", "w") as f:
    json.dump({"type": "FeatureCollection", "features": features}, f)
print(f"✅ Gujarat LULC (2020) cached: {len(features)} features.")


# Close DB connection
cur.close()
conn.close()
print("🔒 Database connection closed.")
print("🎉 All data cached into JSON files successfully!")
