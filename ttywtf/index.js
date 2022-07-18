module.exports = async function (context, req) {
  context.log('JavaScript HTTP trigger function processed a request.');

  const name = (req.query.name || (req.body && req.body.name));
  const responseMessage = name
    ? "Hello, " + name + ". This HTTP triggered function executed successfully."
    : "This HTTP triggered function executed successfully. Pass a name in the query string or in the request body for a personalized response.";

  return {
    // status: 200, /* Defaults to 200 */
    body: responseMessage
  };
};

/** @typedef {{
 *  query: {
 *    name: string;
 *    body: {};
 * }
 * }} Request
 */

/** @typedef {{
 *  body: string | Buffer;
 * }} Response
 */

/**
 * @param {Request} req
 * @returns {Response}
 */
function handleRequest(req) {
}

