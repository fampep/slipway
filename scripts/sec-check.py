#!/usr/bin/env python3
import json
import urllib.error
import urllib.request

def post(path, payload):
    req = urllib.request.Request(
        "http://127.0.0.1:8080" + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, res.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def get(path):
    req = urllib.request.Request("http://127.0.0.1:8080" + path, method="GET")
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, res.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

print("health", get("/api/health"))
print("catalog", get("/api/catalog")[0])
print("apps", get("/api/apps")[0])
print("settings", get("/api/settings")[0])
print("metrics", get("/api/metrics")[0])
print("setup", post("/api/setup", {
    "username": "nope",
    "password": "password123",
    "confirm_password": "password123",
    "public_url": "https://198.50.123.153",
}))
print("login_bad", post("/api/login", {"username": "x", "password": "badpass!!"}))
