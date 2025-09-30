-- 1. state_boundaries
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='state_boundaries' AND xtype='U')
BEGIN
    CREATE TABLE state_boundaries (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        geom geometry
    );
END


-- 2. district_boundaries
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


-- 3. type
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='type' AND xtype='U')
BEGIN
    CREATE TABLE type (
        id INT IDENTITY(1,1) PRIMARY KEY,
        typename VARCHAR(255) NOT NULL
    );
END


-- 4. lulc_stats
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


-- 5. village_boundaries
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
