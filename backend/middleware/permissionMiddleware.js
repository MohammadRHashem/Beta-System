const checkPermission = (requiredPermission) => {
    return (req, res, next) => {
        const userPermissions = req.user?.permissions || [];

        // Universal access for "Administrator" role to prevent lockouts
        if (req.user?.role === 'Administrator' || userPermissions.includes(requiredPermission)) {
            return next();
        }

        return res.status(403).json({ message: 'Forbidden: You do not have the required permission to perform this action.' });
    };
};

module.exports = checkPermission;