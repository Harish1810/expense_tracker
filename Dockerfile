# Stage 1: Build the React Frontend
FROM node:18-alpine as build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Setup the Flask Backend
FROM python:3.11-slim
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Copy built frontend assets from the build stage
# Place them in 'frontend_build' as expected by app.py
COPY --from=build /app/frontend/dist ./frontend_build

# Expose port (Documentation only, Railway ignores this for routing but good for local)
EXPOSE 5000

# Use Gunicorn for production
# Bind to $PORT if available (Railway), else 5000 (Local)
# Use 'exec' to replace the shell properly, and log access to stdout
CMD ["sh", "-c", "exec gunicorn -w 2 -b 0.0.0.0:${PORT:-5000} --access-logfile - app:app"]
