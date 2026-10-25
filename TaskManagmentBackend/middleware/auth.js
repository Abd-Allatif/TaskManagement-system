const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    const token = authHeader && authHeader.split(' ')[1];

    if(!token){
        return res.status(401).json({message: 'Access denied. no Token Provided Please login to access this resource.'});
    }

    try{
        const verified = jwt.verify(token, process.env.JWT_SECRET);

        // Normalize the payload so downstream code can rely on `id` and `type`
        // regardless of whether the token was issued to a user or an admin.
        req.user = {
            ...verified,
            id: verified.adminId || verified.userId,
            type: verified.type || "USER",
        };

        next();
    }catch(err){
        console.error('Token verification error:', err);
        return res.status(403).json({message: 'Invalid or Expired Token, Please login again to access this resource.'});
    }

};

module.exports = verifyToken;