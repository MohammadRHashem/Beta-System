import React, { createContext, useState, useContext } from 'react';

const PortalContext = createContext(null);

export const usePortal = () => useContext(PortalContext);

export const PortalProvider = ({ children }) => {
    // This context will hold the state of the filters from the dashboard
    const [filters, setFilters] = useState({ search: '', date: '', dateFrom: '', dateTo: '' });

    const value = {
        filters,
        setFilters
    };

    return (
        <PortalContext.Provider value={value}>
            {children}
        </PortalContext.Provider>
    );
};
