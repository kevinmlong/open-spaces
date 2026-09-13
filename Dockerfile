# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
# `npm ci` needs the lockfile and gets a clean, reproducible tree.
# --ignore-scripts skips Playwright's browser download: it is a devDependency
# used only for local verification and would add ~100MB to every build.
RUN npm ci --ignore-scripts

COPY . .

# Vite INLINES these into the bundle at build time -- there is no server at
# runtime to read them from the environment, so they must be present here or the
# app ships with `undefined` as its API URL. src/lib/supabase.js throws on
# import if they are missing, so a misconfigured build fails loudly in CI rather
# than serving a white screen to a room of people.
#
# Both values are public by design: the anon key only carries `role: anon`, and
# RLS is the actual security boundary. The service_role key must NEVER appear
# here.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# ---------- serve ----------
# nginx-unprivileged runs as a non-root user and listens on 8080 out of the box,
# which is exactly what Fly wants -- no root, no port juggling.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
