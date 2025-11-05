import React from "react";
import { Navigate, useLocation } from "react-router-dom";

const PortalProtectedRoute = ({ children }) => {
    const token = localStorage.getItem('portalAuthToken');
    const location = useLocation();

    if (!token) {
        // Redirect them to the client login page, passing the current location
        return <Navigate to="/portal/login" state={{ from: location }} replace />;
    }

    return children;
};

export default PortalProtectedRoute;