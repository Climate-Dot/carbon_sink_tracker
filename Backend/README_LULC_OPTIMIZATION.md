# LULC Data Optimization Guide

## The Problem

Azure SQL with Geography types doesn't support `STAsGeoJSON()`. Converting WKT→GeoJSON on every request was taking **10-40 seconds** per request.

## The Solution: Pre-Generated Files

Instead of converting WKT at request time, we:
1. **Pre-generate** GeoJSON files once
2. **Store** them as static files
3. **Serve** them directly (10-100x faster)

---

## Phase 1: Generate Files (One-Time)

### Step 1: Run the generation script

```bash
cd Backend
python generate_lulc_files.py
```

This script will:
- ✅ Connect to Azure SQL
- ✅ Query all districts and years
- ✅ Simplify geometries using `Reduce()` (Azure SQL compatible)
- ✅ Convert WKT → GeoJSON
- ✅ Save files to `static/lulc/{year}/district_{id}.geojson`

**Expected output:**
```
🚀 LULC GeoJSON Pre-Generation Script
======================================================================
📂 Connecting to database...
✓ Connected to Azure SQL
📅 Fetching available years...
✓ Found 11 years: [2012, 2013, ..., 2022]
🗺️  Fetching districts...
✓ Found 33 districts
📁 Creating directory structure...
⚙️  Generating GeoJSON files...
...
✅ Generation Complete!
Files generated: 363
Total features: 45,231
Total time: 142.34s
Total size: 234.56 MB
```

---

## Phase 2: Directory Structure

After generation, you'll have:

```
Backend/
├── main.py
├── generate_lulc_files.py
└── ...

static/
└── lulc/
    ├── 2012/
    │   ├── district_474.geojson
    │   ├── district_475.geojson
    │   └── ...
    ├── 2013/
    │   └── ...
    └── 2022/
        └── ...
```

Each file contains the complete LULC data for one district and one year.

---

## Phase 3: FastAPI Endpoint (Already Implemented)

The `/lulc-geojson` endpoint now has **two paths**:

### 🚀 FAST PATH (Pre-Generated Files)
- Checks if `static/lulc/{year}/district_{id}.geojson` exists
- Serves the file directly
- **~50ms response time** ⚡

### 🐌 FALLBACK PATH (Database Query)
- Used if pre-generated files don't exist
- Queries Azure SQL and converts WKT on-the-fly
- **~10-40s response time** 🐢

**The endpoint automatically uses the fast path if files exist!**

---

## Performance Comparison

| Method | Response Time | Speedup |
|--------|--------------|---------|
| Database query (old) | 10-40 seconds | 1x |
| Pre-generated files | 50-200 ms | **50-800x faster** ⚡ |

---

## Updating Data

If your LULC data changes in the database:

```bash
# Re-generate all files
python generate_lulc_files.py

# Or generate specific year/district (TODO: add script options)
```

---

## Optional: Phase 4 - TopoJSON (Even Smaller Files)

After generating GeoJSON files, you can compress them further:

### Install TopoJSON CLI
```bash
npm install -g topojson
```

### Convert GeoJSON → TopoJSON
```bash
# Single file
topojson -o static/lulc/2022/district_474.topojson static/lulc/2022/district_474.geojson

# Batch convert (Linux/Mac)
find static/lulc -name "*.geojson" -exec sh -c 'topojson -o "${1%.geojson}.topojson" "$1"' _ {} \;
```

**Expected compression: 40-70% smaller files**

---

## Troubleshooting

### Files not being served?
Check the logs:
```
✓ Serving pre-generated file: static/lulc/2022/district_474.geojson
✅ File served in 0.052s (pre-generated)
```

If you see:
```
⏳ No pre-generated files found, querying database...
```
Then files weren't generated or are in the wrong location.

### Generation script fails?
- Check database credentials in `credentials.env`
- Ensure sufficient disk space (~300MB)
- Check database connection timeout settings

---

## Summary

1. ✅ **Run once**: `python generate_lulc_files.py`
2. ✅ **Files created**: `static/lulc/{year}/district_{id}.geojson`
3. ✅ **Endpoint updated**: Automatically serves files
4. ✅ **Result**: 50-800x faster response times

No frontend changes needed! The API endpoint remains the same.

