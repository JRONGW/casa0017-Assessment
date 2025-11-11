FROM nginx:alpine

# Copy all frontend files to nginx html directory
COPY . /usr/share/nginx/html/

# Copy custom nginx configuration for frontend
COPY nginx-frontend.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]