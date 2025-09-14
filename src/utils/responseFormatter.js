class ApiResponse {
  constructor(success, statusCode, message, data = null, errors = null) {
    this.success = success;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;

    if (errors) {
      this.errors = errors;
    }

    // Include timestamp in responses
    this.timestamp = new Date().toISOString();
  }

  // Success responses
  static success(res, statusCode = 200, message = "Success", data = null) {
    return res
      .status(statusCode)
      .json(new ApiResponse(true, statusCode, message, data));
  }

  // Error responses
  static error(res, statusCode = 500, message = "Error", errors = null) {
    return res
      .status(statusCode)
      .json(new ApiResponse(false, statusCode, message, null, errors));
  }

  // Common response types
  static ok(res, data = null, message = "Success") {
    return this.success(res, 200, message, data);
  }

  static created(res, data = null, message = "Resource created successfully") {
    return this.success(res, 201, message, data);
  }

  static badRequest(res, message = "Bad request", errors = null) {
    return this.error(res, 400, message, errors);
  }

  static unauthorized(res, message = "Unauthorized", errors = null) {
    return this.error(res, 401, message, errors);
  }

  static forbidden(res, message = "Forbidden", errors = null) {
    return this.error(res, 403, message, errors);
  }

  static notFound(res, message = "Resource not found", errors = null) {
    return this.error(res, 404, message, errors);
  }

  static serverError(res, message = "Internal server error", errors = null) {
    return this.error(res, 500, message, errors);
  }

  /**
   * Send OK response with cache headers for static data
   * @param {Object} res - Express response object
   * @param {any} data - Response data
   * @param {string} message - Response message
   * @param {number} maxAge - Cache max age in seconds
   */
  static okWithCache(res, data = null, message = "Success", maxAge = 300) {
    res.set("Cache-Control", `public, max-age=${maxAge}`);
    return this.success(res, 200, message, data);
  }
}

module.exports = ApiResponse;
