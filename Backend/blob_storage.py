import logging
import os
from typing import Optional

from azure.core.exceptions import ResourceNotFoundError, ResourceExistsError
from azure.storage.blob import BlobServiceClient, ContentSettings

logger = logging.getLogger(__name__)

_container_client = None


def _get_container_client():
    global _container_client
    if _container_client is not None:
        return _container_client

    connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    container_name = os.getenv("AZURE_STORAGE_CONTAINER")

    if not connection_string or not container_name:
        raise ValueError(
            "Missing Azure storage configuration. "
            "Set AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER."
        )

    service_client = BlobServiceClient.from_connection_string(connection_string)
    _container_client = service_client.get_container_client(container_name)
    try:
        _container_client.create_container()
        logger.info("Created blob container: %s", container_name)
    except ResourceExistsError:
        pass
    return _container_client


def get_lulc_blob_path(year: int, district_id: str, prefix: Optional[str] = None) -> str:
    resolved_prefix = (prefix or os.getenv("LULC_BLOB_PREFIX", "lulc")).strip("/")
    return f"{resolved_prefix}/{year}/district_{district_id}.geojson"


def blob_exists(blob_path: str) -> bool:
    blob_client = _get_container_client().get_blob_client(blob_path)
    try:
        blob_client.get_blob_properties()
        return True
    except ResourceNotFoundError:
        return False


def upload_blob(
    blob_path: str,
    data: bytes | str,
    *,
    content_type: Optional[str] = None,
    overwrite: bool = True,
) -> None:
    if isinstance(data, str):
        data = data.encode("utf-8")

    blob_client = _get_container_client().get_blob_client(blob_path)
    content_settings = ContentSettings(content_type=content_type) if content_type else None
    blob_client.upload_blob(data, overwrite=overwrite, content_settings=content_settings)
    logger.info("Uploaded blob: %s", blob_path)


def download_blob(blob_path: str) -> bytes:
    blob_client = _get_container_client().get_blob_client(blob_path)
    return blob_client.download_blob().readall()