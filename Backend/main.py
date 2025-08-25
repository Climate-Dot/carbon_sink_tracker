from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import geopandas as gpd
import psycopg2
import json
# import asyncio
from concurrent.futures import ThreadPoolExecutor

# app = FastAPI()
executor = ThreadPoolExecutor()

def get_connection():
    return psycopg2.connect(
            dbname="postgres",
            user="postgres",
            password="1234",
            host="localhost",
            port="5432"
    )

# Create a lifespan context for startup logic
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load the shapefiles at startup
    print("Loading shapefiles...")

    district_gdf = gpd.read_file("D:/ClimateDot/State_District_boundary/District Boundary/Gujarat_district.shp")
    district_gdf = district_gdf.to_crs(epsg=4326)
    app.state.district_boundary = json.loads(district_gdf.to_json())

    state_gdf = gpd.read_file("D:/ClimateDot/State_District_boundary/GUJARAT_STATE_BDY.shp")
    state_gdf = state_gdf[state_gdf["STATE"] == "GUJARAT"]
    state_gdf = state_gdf.to_crs(epsg=4326)
    app.state.state_boundary = json.loads(state_gdf.to_json())
    
    village_gdf = gpd.read_file("D:/ClimateDot/State_District_boundary/Village Boundary/Teritorial Circle_Village_Boundary.shp")
    village_gdf = village_gdf.to_crs(epsg=4326)
    app.state.village_boundary = json.loads(village_gdf.to_json())

    # lulc_gdf = gpd.read_file("D:/ClimateDot/output/LULC_new.shp")
    # # lulc_gdf = state_gdf[state_gdf["STATE"] == "GUJARAT"]
    # lulc_gdf = lulc_gdf.to_crs(epsg=4326)
    # app.state.lulc_vector = json.loads(lulc_gdf.to_json())

    # Load GeoJSON vector file (LULC)
    # lulc_gdf = gpd.read_file("C:/Users/Simran Singh/Downloads/LULC_Vector_AHMADABAD.geojson")
    # lulc_gdf = lulc_gdf.to_crs(epsg=4326)  # ensure correct CRS
    # app.state.lulc_vector = json.loads(lulc_gdf.to_json())

    print("Shapefiles loaded.")
    # Fetch distinct districts and years
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT DISTINCT name FROM district_boundaries ORDER BY name;")
    app.state.districts = [row[0] for row in cur.fetchall()]

    cur.execute("SELECT DISTINCT year FROM lulc_stats ORDER BY year;")
    app.state.years = [row[0] for row in cur.fetchall()]
    
    # cur.execute("""
    # SELECT json_build_object(
    #     'type', 'FeatureCollection',
    #     'features', json_agg(
    #         json_build_object(
    #             'type', 'Feature',
    #             'geometry', ST_AsGeoJSON(geom)::json,
    #             'properties', json_build_object(
    #                 'type_id', type_id,
    #                 'year', year
    #             )
    #         )
    #     )
    # )
    # FROM lulc_stats
    # WHERE year = 2020;
    # """)
    # app.state.lulc = cur.fetchone()[0]
    
    cur.close()
    conn.close()

    yield  # Startup complete
    # You could add cleanup logic here on shutdown if needed

# Instantiate the app with lifespan
app = FastAPI(lifespan=lifespan)

# Allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/metadata")
async def get_all_metadata():
    return JSONResponse(
        content={
            "district_boundary": app.state.district_boundary,
            # "district_name": app.state.district_name,
            "state_boundary": app.state.state_boundary,
            # "lulc_vector": app.state.lulc_vector,
            "village_boundary": app.state.village_boundary,
            # "lulc": app.state.lulc,
        }
    )

@app.get("/districts")
async def get_districts():
    return JSONResponse(content=app.state.districts)

@app.get("/years")
async def get_years():
    return JSONResponse(content=app.state.years)



# @app.get("/lulc-geojson")
# def get_lulc(district: str = Query(None), year: int = Query(None)):
#     conn = get_connection()
#     cur = conn.cursor()

#     query = """
#         SELECT jsonb_build_object(
#             'type', 'FeatureCollection',
#             'features', jsonb_agg(
#                 jsonb_build_object(
#                     'type', 'Feature',
#                     'geometry', ST_AsGeoJSON(geom)::jsonb,
#                     'properties', to_jsonb(lulc_stats) - 'geom'
#                 )
#             )
#         )
#         FROM lulc_stats
#         WHERE (%s IS NULL OR district_name = %s)
#           AND (%s IS NULL OR year = %s);
#     """
#     cur.execute(query, (district, district, year, year))
#     geojson = cur.fetchone()[0]

#     cur.close()
#     conn.close()

#     return JSONResponse(content=geojson)

@app.get("/lulc-geojson")
def get_lulc(district: list[str] = Query(...), year: int = Query(...)):
    conn = get_connection()
    cur = conn.cursor()

    query = """
        SELECT jsonb_build_object(
            'type', 'FeatureCollection',
            'features', jsonb_agg(
                jsonb_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(geom)::jsonb,
                    'properties', to_jsonb(lulc_stats) - 'geom'
                )
            )
        )
        FROM lulc_stats
        WHERE (%s IS NULL OR district_name = ANY(%s))
          AND (%s IS NULL OR year = %s);
    """

    cur.execute(query, (district if district else None, district, year if year else None, year))
    geojson = cur.fetchone()[0]

    cur.close()
    conn.close()

    return JSONResponse(content=geojson or {"type": "FeatureCollection", "features": []})

# @app.get("/districts")
# def get_districts():
#     conn = get_connection()
#     cur = conn.cursor()

#     cur.execute("SELECT DISTINCT district_name FROM lulc_stats ORDER BY district_name;")
#     rows = cur.fetchall()

#     cur.close()
#     conn.close()

#     return [row[0] for row in rows]


# @app.get("/years")
# def get_years():
#     conn = get_connection()
#     cur = conn.cursor()

#     cur.execute("SELECT DISTINCT year FROM lulc_stats ORDER BY year;")
#     rows = cur.fetchall()

#     cur.close()
#     conn.close()

#     return [row[0] for row in rows]

@app.get("/gujarat-boundaries/")
def get_gujarat_boundaries():
    conn = get_connection()
    cursor = conn.cursor()

    sql = """
    SELECT 
        district_name, 
        ST_AsGeoJSON(geometry) 
    FROM gujarat_districts
    """

    cursor.execute(sql)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    features = []
    for district_name, geom_json in rows:
        if geom_json:
            features.append({
                "type": "Feature",
                "geometry": json.loads(geom_json),
                "properties": {"district_name": district_name}
            })

    return {
        "type": "FeatureCollection",
        "features": features
    }

# @app.get("/gujarat-district-boundary")
# def get_gujarat_boundary():
#     gdf = gpd.read_file("C:/Users/Simran Singh/Downloads/gadm41_IND_shp/gadm41_IND_2.shp")
#      # Filter for Gujarat
#     gdf = gdf[gdf["NAME_1"] == "Gujarat"]
#     gdf = gdf.to_crs(epsg=4326) 
#     # geojson = gdf.to_json()
#     # return JSONResponse(content=geojson)
#     geojson = json.loads(gdf.to_json())
#     return JSONResponse(content=geojson)


# @app.get("/district-lulc/")
# def get_district_lulc(district_name: str = Query(..., description="Name of the district")):
#     conn = get_connection()
#     cursor = conn.cursor()

#     sql = """
#     SELECT 
#         l.lulc_class,
#         ST_AsGeoJSON(ST_Intersection(d.geom, l.geom)) AS geometry
#     FROM 
#         gujarat_districts d
#     JOIN 
#         lulc_data l
#     ON 
#         ST_Intersects(d.geom, l.geom)
#     WHERE 
#         d.district_name = %s
#     """

#     cursor.execute(sql, (district_name,))
#     rows = cursor.fetchall()

#     features = []
#     for row in rows:
#         lulc_class, geometry = row
#         if geometry:
#             features.append({
#                 "type": "Feature",
#                 "geometry": json.loads(geometry),
#                 "properties": {"lulc_class": lulc_class}
#             })

#     cursor.close()
#     conn.close()

#     return {
#         "type": "FeatureCollection",
#         "features": features
#     }
