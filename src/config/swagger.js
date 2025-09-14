const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");

// Load YAML file
const swaggerDocument = YAML.load(
  path.resolve(__dirname, "../docs/swagger.yaml")
);

module.exports = {
  serve: swaggerUi.serve,
  setup: swaggerUi.setup(swaggerDocument, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Evently API Documentation",
    customfavIcon: "https://nodejs.org/static/images/favicons/favicon.ico", // Change this as needed
  }),
};
