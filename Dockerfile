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

# Expose port (Documentation only)
EXPOSE 5000

# Copy startup script
COPY start.sh .
RUN chmod +x start.sh

# Run the startup script
CMD ["./start.sh"]
