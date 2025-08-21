from dotenv import load_dotenv
import os
import psycopg2
from shapely import wkt
import geopandas as gpd


# Load environment variables from .env file
load_dotenv(dotenv_path='credentials.env')

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

print(f"DB_PASSWORD loaded? {'Yes' if DB_PASSWORD else 'No'}")  # quick check

def create_table():
    try:
        # Connect to PostgreSQL
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT
        )
        cur = conn.cursor()

        # Create table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS district_boundaries (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                state VARCHAR(255),
                area NUMERIC,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,,
                geom geometry(MULTIPOLYGON, 4326)
            );
        """)

        conn.commit()
        cur.close()
        conn.close()
        print("✅ district_boundaries table created successfully!")

    except Exception as e:
        print("❌ Error:", e)

if __name__ == "__main__":
    create_table()
