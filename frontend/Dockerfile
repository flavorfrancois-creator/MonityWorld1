FROM node:20-slim AS build

WORKDIR /app

RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile

COPY . .

ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

RUN yarn build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
ARG BACKEND_PROXY_URL=http://monityworld.win/admin
COPY nginx.conf /tmp/nginx.conf.template
RUN sed "s|__BACKEND_PROXY_URL__|${BACKEND_PROXY_URL}|g" /tmp/nginx.conf.template > /etc/nginx/conf.d/default.conf \
    && rm /tmp/nginx.conf.template
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
