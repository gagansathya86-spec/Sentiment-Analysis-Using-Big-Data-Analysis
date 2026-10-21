"""
Distributed storage/processing abstraction.

The paper's architecture uses HDFS for distributed storage and Apache Spark
for distributed, in-memory processing (Section II-C). A real Hadoop/Spark
cluster is rarely available in a local dev environment, so this module
defines a small ProcessingEngine interface with two implementations:

  - PandasProcessingEngine: local development mode backed by pandas and
    local dataset files. It is not an HDFS fallback. Facebook records use a
    separate WebHDFS sink in services.hdfs_storage.
  - SparkProcessingEngine: production mode. Reads/writes through HDFS and
    processes with PySpark. Only imported/instantiated when
    PROCESSING_ENGINE=spark, so the app has zero hard dependency on a
    Spark/Hadoop installation for local dev.

Swapping PROCESSING_ENGINE in .env is the only change needed to move a
deployment from local pandas dev mode onto a real Hadoop/Spark cluster —
every caller in the codebase only ever talks to this interface.
"""
from abc import ABC, abstractmethod
from typing import Any
import pandas as pd

from config import settings


class ProcessingEngine(ABC):
    """Common interface for distributed storage + processing."""

    @abstractmethod
    def read_csv(self, path: str) -> pd.DataFrame:
        ...

    @abstractmethod
    def write_dataset(self, df: pd.DataFrame, path: str) -> None:
        ...

    @abstractmethod
    def read_dataset(self, path: str) -> pd.DataFrame:
        ...

    @abstractmethod
    def drop_duplicates(self, df: pd.DataFrame) -> pd.DataFrame:
        ...

    @abstractmethod
    def drop_missing(self, df: pd.DataFrame, subset=None) -> pd.DataFrame:
        ...

    @abstractmethod
    def apply_text_transform(self, df: pd.DataFrame, column: str, fn) -> pd.DataFrame:
        ...

    @property
    @abstractmethod
    def engine_name(self) -> str:
        ...


class PandasProcessingEngine(ProcessingEngine):
    """Local development dataset processing engine backed by pandas.

    Mirrors Spark transformations, but runs single-node and in-memory with
    local data directories. It does not write to HDFS.
    """

    @property
    def engine_name(self) -> str:
        return "pandas-local (Hadoop/Spark-compatible interface)"

    def read_csv(self, path: str) -> pd.DataFrame:
        return pd.read_csv(path)

    def write_dataset(self, df: pd.DataFrame, path: str) -> None:
        df.to_csv(path, index=False)

    def read_dataset(self, path: str) -> pd.DataFrame:
        return pd.read_csv(path)

    def drop_duplicates(self, df: pd.DataFrame) -> pd.DataFrame:
        return df.drop_duplicates().reset_index(drop=True)

    def drop_missing(self, df: pd.DataFrame, subset=None) -> pd.DataFrame:
        return df.dropna(subset=subset).reset_index(drop=True)

    def apply_text_transform(self, df: pd.DataFrame, column: str, fn) -> pd.DataFrame:
        df = df.copy()
        df[column] = df[column].apply(fn)
        return df


class SparkProcessingEngine(ProcessingEngine):
    """Production processing engine: HDFS storage + Spark distributed
    processing, as described in the paper.

    Only instantiated when PROCESSING_ENGINE=spark. Requires a working
    PySpark installation and access to an HDFS namenode; neither is
    required for local development.
    """

    def __init__(self):
        try:
            from pyspark.sql import SparkSession
        except ImportError as e:
            raise RuntimeError(
                "PROCESSING_ENGINE=spark requires the 'pyspark' package "
                "(pip install pyspark) and a reachable Spark/HDFS cluster. "
                "Install it or switch PROCESSING_ENGINE back to 'pandas' "
                "in your .env for local development."
            ) from e

        self.spark = SparkSession.builder \
            .appName(settings.APP_NAME) \
            .master(settings.SPARK_MASTER_URL) \
            .getOrCreate()
        self.hdfs_namenode = settings.HDFS_NAMENODE_URL

    @property
    def engine_name(self) -> str:
        return "spark-hdfs"

    def _hdfs_path(self, path: str) -> str:
        if path.startswith("hdfs://"):
            return path
        return f"{self.hdfs_namenode}{path}"

    def read_csv(self, path: str) -> pd.DataFrame:
        sdf = self.spark.read.csv(self._hdfs_path(path), header=True, inferSchema=True)
        return sdf.toPandas()

    def write_dataset(self, df: pd.DataFrame, path: str) -> None:
        sdf = self.spark.createDataFrame(df)
        sdf.write.mode("overwrite").csv(self._hdfs_path(path), header=True)

    def read_dataset(self, path: str) -> pd.DataFrame:
        return self.read_csv(path)

    def drop_duplicates(self, df: pd.DataFrame) -> pd.DataFrame:
        sdf = self.spark.createDataFrame(df)
        return sdf.dropDuplicates().toPandas()

    def drop_missing(self, df: pd.DataFrame, subset=None) -> pd.DataFrame:
        sdf = self.spark.createDataFrame(df)
        return sdf.dropna(subset=subset).toPandas()

    def apply_text_transform(self, df: pd.DataFrame, column: str, fn) -> pd.DataFrame:
        from pyspark.sql.functions import udf
        from pyspark.sql.types import StringType
        sdf = self.spark.createDataFrame(df)
        spark_udf = udf(fn, StringType())
        sdf = sdf.withColumn(column, spark_udf(sdf[column]))
        return sdf.toPandas()


_engine_instance: ProcessingEngine = None


def get_processing_engine() -> ProcessingEngine:
    """Factory returning the configured processing engine (singleton)."""
    global _engine_instance
    if _engine_instance is None:
        if settings.PROCESSING_ENGINE.lower() == "spark":
            _engine_instance = SparkProcessingEngine()
        else:
            _engine_instance = PandasProcessingEngine()
    return _engine_instance
