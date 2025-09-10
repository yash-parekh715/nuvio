const jwt = require("jsonwebtoken");
const { prisma } = require("../config/database");
const ApiResponse = require("../utils/responseFormatter");


// Middleware to verify JWT
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Check if token exists in Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return ApiResponse.unauthorized(res, "Not authorized, no token");
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user in database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      return ApiResponse.unauthorized(res, "User not found");
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return ApiResponse.unauthorized(res, "Not authorized", error.message);
  }
};

// Middleware to restrict access based on role
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, "Not authorized, no user");
    }

    if (!roles.includes(req.user.role)) {
      return ApiResponse.forbidden(
        res,
        `Role ${req.user.role} is not authorized to access this resource`
      );
    }

    next();
  };
};
