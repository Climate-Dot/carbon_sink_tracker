from dotenv import load_dotenv
import os
import pyodbc
print(pyodbc.drivers())

# Load environment variables
load_dotenv("D:/ClimateDot/CarbonSink/Backend/credentials.env")

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")


def create_tables():
    try:
        # Connect to SQL Server
        conn = pyodbc.connect(
            "DRIVER={ODBC Driver 18 for SQL Server};"
            f"SERVER={DB_HOST},{DB_PORT};"
            f"DATABASE={DB_NAME};"
            f"UID={DB_USER};"
            f"PWD={DB_PASSWORD}"
        )
        cursor = conn.cursor()

        # === Create state_boundaries ===
        cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='state_boundaries' AND xtype='U')
        BEGIN
            CREATE TABLE state_boundaries (
                id INT IDENTITY(1,1) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                geom geometry
            );
        END
        """)

        # === Create district_boundaries ===
        cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='district_boundaries' AND xtype='U')
        BEGIN
            CREATE TABLE district_boundaries (
                id INT IDENTITY(1,1) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                area DECIMAL(18,2),
                state_id INT FOREIGN KEY REFERENCES state_boundaries(id),
                geom geometry,
                created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
                updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
            );
        END
        """)

        # === Create type ===
        cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='type' AND xtype='U')
        BEGIN
            CREATE TABLE type (
                id INT IDENTITY(1,1) PRIMARY KEY,
                typename VARCHAR(255) NOT NULL
            );
        END
        """)

        # === Create lulc_stats ===
        cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='lulc_stats' AND xtype='U')
        BEGIN
            CREATE TABLE lulc_stats (
                id INT IDENTITY(1,1) PRIMARY KEY,
                type_id INT FOREIGN KEY REFERENCES type(id),
                district_id INT FOREIGN KEY REFERENCES district_boundaries(id),
                year INT,
                area DECIMAL(18,2),
                geom geometry
            );
        END
        """)

        # === Create village_boundaries ===
        cursor.execute("""
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='village_boundaries' AND xtype='U')
        BEGIN
            CREATE TABLE village_boundaries (
                id INT IDENTITY(1,1) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                district_name VARCHAR(255),
                area DECIMAL(18,2),
                geom geometry
            );
        END
        """)

        conn.commit()
        cursor.close()
        conn.close()
        print("✅ All tables created successfully!")

    except Exception as e:
        print("❌ Error:", e)


if __name__ == "__main__":
    create_tables()
