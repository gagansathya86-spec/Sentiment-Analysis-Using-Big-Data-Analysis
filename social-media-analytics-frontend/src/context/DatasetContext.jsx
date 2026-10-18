import React, { createContext, useState, useEffect } from 'react';

export const DatasetContext = createContext();

export const DatasetProvider = ({ children }) => {
  const [datasetId, setDatasetId] = useState(localStorage.getItem('datasetId') || null);
  const [filename, setFilename] = useState(localStorage.getItem('filename') || null);
  const [columnMapping, setColumnMapping] = useState(
    JSON.parse(localStorage.getItem('columnMapping')) || null
  );
  const [modelMetrics, setModelMetrics] = useState(
    JSON.parse(localStorage.getItem('modelMetrics')) || null
  );

  useEffect(() => {
    if (datasetId) localStorage.setItem('datasetId', datasetId);
    else localStorage.removeItem('datasetId');
  }, [datasetId]);

  useEffect(() => {
    if (filename) localStorage.setItem('filename', filename);
    else localStorage.removeItem('filename');
  }, [filename]);

  useEffect(() => {
    if (columnMapping) localStorage.setItem('columnMapping', JSON.stringify(columnMapping));
    else localStorage.removeItem('columnMapping');
  }, [columnMapping]);

  useEffect(() => {
    if (modelMetrics) localStorage.setItem('modelMetrics', JSON.stringify(modelMetrics));
    else localStorage.removeItem('modelMetrics');
  }, [modelMetrics]);

  const clearDataset = () => {
    setDatasetId(null);
    setFilename(null);
    setColumnMapping(null);
    setModelMetrics(null);
  };

  return (
    <DatasetContext.Provider
      value={{
        datasetId,
        setDatasetId,
        filename,
        setFilename,
        columnMapping,
        setColumnMapping,
        modelMetrics,
        setModelMetrics,
        clearDataset,
      }}
    >
      {children}
    </DatasetContext.Provider>
  );
};
