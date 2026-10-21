/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, next) {
  console.error('[Error]', err.message, err.stack);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
    error: {
      code: err.code || 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
}

/**
 * 404 not found handler
 */
function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    error: { code: 'NOT_FOUND' },
  });
}

module.exports = { errorHandler, notFound };
