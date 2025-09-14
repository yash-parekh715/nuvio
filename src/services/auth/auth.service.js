const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { prisma } = require("../../config/database");

class AuthService {
  /**
   * Register a new user
   * @param {string} name - User's name
   * @param {string} email - User's email
   * @param {string} password - User's password
   * @param {string} role - User's role (ADMIN or USER)
   * @returns {Promise<Object>} User object and token
   */
  static async register(name, email, password, role) {
    // Check if user already exists
    const userExists = await prisma.user.findUnique({
      where: { email },
    });

    if (userExists) {
      throw new Error("User already exists");
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role === "ADMIN" ? "ADMIN" : "USER",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    const token = this.#generateToken(user.id, user.role);

    return { user, token };
  }

  /**
   * Login user
   * @param {string} email - User's email
   * @param {string} password - User's password
   * @returns {Promise<Object>} User object and token
   */
  static async login(email, password) {
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new Error("Invalid credentials");
    }

    // Check if password matches
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new Error("Invalid credentials");
    }

    const token = this.#generateToken(user.id, user.role);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    };
  }

  /**
   * Generate JWT token
   * @private
   * @param {string} userId - User ID
   * @param {string} role - User role
   * @returns {string} JWT token
   */
  static #generateToken(userId, role) {
    return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });
  }
}

module.exports = AuthService;
