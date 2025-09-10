require("dotenv").config();
const app = require("./src/app");
const { connectDB } = require("./src/config/database");

const PORT = process.env.PORT || 3000;

// Connect to database
connectDB()
  .then(() => {
    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
