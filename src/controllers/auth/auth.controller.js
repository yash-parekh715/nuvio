const AuthService = require("../../services/auth/auth.service");
const ApiResponse = require("../../utils/responseFormatter");

// Register a new user
exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const result = await AuthService.register(name, email, password, role);

    return ApiResponse.created(res, result, "User registered successfully");
  } catch (error) {
    console.error("Register error:", error);

    if (error.message === "User already exists") {
      return ApiResponse.badRequest(res, "User already exists");
    }

    return ApiResponse.serverError(res, "Internal Server Error", error.message);
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await AuthService.login(email, password);

    return ApiResponse.ok(res, result, "Login successful");
  } catch (error) {
    console.error("Login error:", error);

    if (error.message === "Invalid credentials") {
      return ApiResponse.unauthorized(res, "Invalid credentials");
    }

    return ApiResponse.serverError(res, "Internal Server Error", error.message);
  }
};
