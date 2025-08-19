from dotenv import load_dotenv
import os
import psycopg2
from shapely import wkt
import geopandas as gpd

# Load environment variables from .env file
load_dotenv(dotenv_path='credentials.env')

os.environ['SHAPE_RESTORE_SHX'] = 'YES'

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

def insert_shapefile_to_db(shp_path):
    # Load shapefile with geopandas
    gdf = gpd.read_file(shp_path)

    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT
        )
        cur = conn.cursor()

        for idx, row in gdf.iterrows():
            id_val = row['Dist_LGD'] if 'Dist_LGD' in gdf.columns else None
            name = row['DISTRICT'] if 'DISTRICT' in gdf.columns else f'District_{idx}'
            state = row['STATE_UT'] if 'STATE_UT' in gdf.columns else None
            area = row['AREA'] if 'AREA' in gdf.columns else None
            geom_wkt = row['geometry'].wkt
            
            if id_val is not None:
                insert_query = """
                    INSERT INTO district_boundaries (id, name, state, area, geom)
                    VALUES (%s, %s, %s, %s, ST_GeomFromText(%s, 4326));
                """
                cur.execute(insert_query, (id_val, name, state, area, geom_wkt))
            else:
                insert_query = """
                    INSERT INTO district_boundaries (name, state, area, geom)
                    VALUES (%s, %s, %s, ST_GeomFromText(%s, 4326));
                """
                cur.execute(insert_query, (name, state, area, geom_wkt))


        conn.commit()
        cur.close()
        conn.close()
        print("✅ Shapefile data inserted successfully into district_boundaries!")

    except Exception as e:
        print("❌ Error inserting shapefile data:", e)

if __name__ == "__main__":
    shp_file_path = "D:/ClimateDot/State_District_boundary/District Boundary/Gujarat_district.shp"
    insert_shapefile_to_db(shp_file_path)
