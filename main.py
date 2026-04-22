# main.py
import sys
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient, errors as pymongo_errors
from bson import ObjectId
from pydantic import BaseModel, Field
import hashlib

# === НАСТРОЙКА ЛОГИРОВАНИЯ ===
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

# === ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ===
app = FastAPI(title="DB1113 API", version="1.0.0")

# === CORS ===
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === ПОДКЛЮЧЕНИЕ К MONGODB ===
try:
    client = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    logger.info("✅ MongoDB connected")
except pymongo_errors.ConnectionFailure as e:
    logger.error(f"❌ MongoDB connection failed: {e}")
    sys.exit(1)

db = client["DB1113"]

collections = {
    "users": db["users"],
    "cars": db["cars"]
}

# === КОНФИГУРАЦИЯ ТАБЛИЦ ===
TABLE_CONFIG: Dict[str, Dict[str, Any]] = {
    "users": {
        "defaults": [
            "Full Name", "Address", "Citizenship",
            "Declared", "Phone", "Email", "Terms",
            "Initial payment", "Total debt", "Annual rate", "Monthly payment"
        ],
        "status": ["paid", "pending", "overdue"],
        "link_field": "object",
        "link_collection": "cars"
    },
    "cars": {
        "defaults": ["Brand", "Model", "VIN", "Plate", "Mileage", "Cost €"],
        "status": ["available", "busy"]
    }
}

# === PYDANTIC МОДЕЛИ ===
class SavePayload(BaseModel):
    columns: List[Dict[str, Any]] = Field(default_factory=list)
    rows: List[Dict[str, Any]] = Field(default_factory=list)

class DeletePayload(BaseModel):
    rows: List[Dict[str, Any]] = Field(default_factory=list)

# === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

def serialize_id(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return str(value)
    return str(value)

def get_utc_now() -> datetime:
    return datetime.now(timezone.utc)

def get_collection(name: str):
    return collections.get(name.lower())

def get_table_document(table_name: str) -> Optional[Dict[str, Any]]:
    collection = get_collection(table_name)
    if collection is None:
        return None
    return collection.find_one({"table": table_name})

def save_table_document(table_name: str, columns: List[Dict], rows: List[Dict]) -> bool:
    collection = get_collection(table_name)
    if collection is None:
        return False
    collection.delete_many({"table": table_name})
    collection.insert_one({
        "table": table_name,
        "columns": columns,
        "rows": rows,
        "updated_at": get_utc_now()
    })
    return True

def build_field_name(title: str) -> str:
    return title.lower().replace(" ", "_").replace("€", "eur").replace(".", "_")

def build_columns(table_name: str, document: Optional[Dict]) -> List[Dict[str, Any]]:
    config = TABLE_CONFIG.get(table_name, {})
    columns = document.get("columns", []) if document else []
    if not isinstance(columns, list):
        columns = []
    columns = [c.copy() for c in columns]

    if not any(c.get("field") == "select" for c in columns):
        columns.insert(0, {"field": "select", "title": "Select", "width": 50, "frozen": True})

    if not any(c.get("field") == "status" for c in columns):
        columns.insert(1, {
            "field": "status",
            "title": "Status",
            "values": config.get("status", []),
            "editor": "list",
            "width": 100
        })

    for title in config.get("defaults", []):
        field_name = build_field_name(title)
        if not any(c.get("field") == field_name for c in columns):
            columns.append({"field": field_name, "title": title})

    return columns

def get_linked_items(collection_name: str) -> Dict[str, str]:
    if not collection_name or collection_name is None:
        return {}
    collection = get_collection(collection_name)
    if collection is None:
        return {}
    items = {}
    for doc in collection.find({}, {"_id": 1, "brand": 1, "model": 1}):
        item_id = serialize_id(doc.get("_id"))
        label = f"{doc.get('brand', '')} {doc.get('model', '')}".strip()
        if item_id and label:
            items[item_id] = label
    return items

def prepare_row_for_frontend(table_name: str, row: Dict[str, Any], linked_cache: Dict[str, Dict[str, str]]) -> Dict[str, Any]:
    row_id = row.get("_id") or row.get("id")
    if not row_id:
        unique_str = f"{row.get('brand','')}_{row.get('model','')}_{row.get('vin','')}_{row.get('plate','')}"
        row_id = hashlib.md5(unique_str.encode()).hexdigest()

    result = {"id": serialize_id(row_id)}

    for key, value in row.items():
        if key in ("_id", "id"): continue
        result[key] = serialize_id(value) if isinstance(value, ObjectId) else value

    if table_name == "users" and "object" in result:
        val = result["object"]
        if isinstance(val, dict): result["object"] = serialize_id(val.get("id") or val.get("_id"))
        elif isinstance(val, ObjectId): result["object"] = serialize_id(val)

    return result

def prepare_rows_for_frontend(table_name: str, rows: List[Dict]) -> List[Dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    
    linked_cache = {}
    config = TABLE_CONFIG.get(table_name, {})
    link_collection = config.get("link_collection")
    if link_collection:
        linked_cache[link_collection] = get_linked_items(link_collection)

    return [prepare_row_for_frontend(table_name, row, linked_cache) for row in rows]

def clean_row_for_storage(row: Dict[str, Any]) -> Dict[str, Any]:
    result = {k: v for k, v in row.items() if k not in ("id", "select")}
    if "id" in row and "_id" not in result:
        try:
            result["_id"] = ObjectId(row["id"])
        except Exception:
            result["_id"] = row["id"]
    return result

# === СТАТИКА И ШАБЛОНЫ ===
app.mount("/static", StaticFiles(directory="."), name="static")
templates = Jinja2Templates(directory=".")

# === РОУТЫ ===

@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/{table_name}", response_class=JSONResponse)
def get_table(table_name: str):
    table_name = table_name.lower()
    if table_name not in collections or collections[table_name] is None:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")
    
    try:
        document = get_table_document(table_name)
        config = TABLE_CONFIG.get(table_name, {})
        
        # 1. Сначала строим колонки
        columns = build_columns(table_name, document)
        
        # 2. ✅ FIX: Фильтруем лишние колонки ПОСЛЕ их создания
        if table_name == "cars":
            columns = [c for c in columns if c.get("field") not in ("monthly_payment", "next_payment_date")]
        
        raw_rows = document.get("rows", []) if document else []
        rows = prepare_rows_for_frontend(table_name, raw_rows)
        
        linked_data = {}
        link_collection = config.get("link_collection")
        if link_collection:
            linked_data = get_linked_items(link_collection)
        
        return {
            "columns": columns,
            "rows": rows,
            "defaults": config,
            "linked": linked_data
        }
    except Exception as e:
        logger.error(f"Error fetching {table_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/{table_name}/save", response_class=JSONResponse)
def save_table(table_name: str, payload: SavePayload):
    table_name = table_name.lower()
    if table_name not in collections or collections[table_name] is None:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")
    
    try:
        cleaned_rows = [clean_row_for_storage(row) for row in payload.rows]

        if table_name == "users":
            assigned_car_ids = set()
            for row in payload.rows:
                obj = row.get("object")
                if obj:
                    assigned_car_ids.add(str(obj).strip().lower())

            logger.info(f"🔍 Назначенные машины (из payload): {assigned_car_ids}")

            cars_collection = get_collection("cars")
            if cars_collection is not None:
                cars_doc = cars_collection.find_one({"table": "cars"})
                if cars_doc and isinstance(cars_doc.get("rows"), list):
                    updated = False
                    for car in cars_doc["rows"]:
                        raw_id = car.get("_id") or car.get("id")
                        if raw_id:
                            car_id = str(raw_id).strip().lower()
                        else:
                            unique_str = f"{car.get('brand','')}_{car.get('model','')}_{car.get('vin','')}_{car.get('plate','')}"
                            car_id = hashlib.md5(unique_str.encode()).hexdigest()
                            car["id"] = car_id

                        current_status = str(car.get("status", "")).strip().lower()
                        new_status = "busy" if car_id in assigned_car_ids else "available"

                        if current_status != new_status:
                            car["status"] = new_status
                            updated = True

                    if updated:
                        cars_collection.update_one(
                            {"table": "cars"},
                            {"$set": {"rows": cars_doc["rows"], "updated_at": get_utc_now()}}
                        )
                        logger.info("✅ Статусы машин успешно синхронизированы в БД")

            for row in cleaned_rows:
                if row.get("object") and not row.get("status"):
                    row["status"] = "paid"

        cleaned_columns = [
            {k: v for k, v in col.items() if k in ("field", "title", "values", "editor", "width", "frozen")}
            for col in payload.columns
        ]
        save_table_document(table_name, cleaned_columns, cleaned_rows)
        
        logger.info(f"💾 Saved {len(cleaned_rows)} rows to {table_name}")
        return {"status": "ok", "count": len(cleaned_rows)}
        
    except pymongo_errors.PyMongoError as e:
        logger.error(f"MongoDB error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/{table_name}/delete", response_class=JSONResponse)
def delete_rows(table_name: str, payload: DeletePayload):
    table_name = table_name.lower()
    collection = get_collection(table_name)
    if collection is None:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")
    
    try:
        ids_to_delete = set()
        for row in payload.rows:
            row_id = row.get("id") or row.get("_id")
            if row_id:
                ids_to_delete.add(serialize_id(row_id))
        
        if not ids_to_delete:
            return {"status": "ok", "deleted": 0}
        
        document = get_table_document(table_name)
        if document is None or not isinstance(document.get("rows"), list):
            return {"status": "ok", "deleted": 0}
        
        new_rows = []
        for row in document["rows"]:
            row_id = serialize_id(row.get("_id") or row.get("id"))
            if row_id not in ids_to_delete:
                new_rows.append(row)
        
        collection.update_one(
            {"table": table_name},
            {"$set": {"rows": new_rows, "updated_at": get_utc_now()}}
        )
        
        deleted_count = len(document["rows"]) - len(new_rows)
        logger.info(f"🗑️ Deleted {deleted_count} rows from {table_name}")
        return {"status": "ok", "deleted": deleted_count}
        
    except Exception as e:
        logger.error(f"Delete error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# === УТИЛИТЫ ===
def drop_all_tables():
    for name, collection in collections.items():
        count = collection.delete_many({}).deleted_count
        logger.info(f"🗑️ Dropped {count} documents from {name}")

if "--drop" in sys.argv:
    drop_all_tables()
    logger.info("✅ Database reset complete")
    sys.exit(0)

# === ЗАПУСК ===
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info"
    )