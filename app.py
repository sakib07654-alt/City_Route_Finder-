
import heapq
import math
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
DB_NAME = BASE_DIR / "database.db"


# ---------------- DATABASE CONNECTION ----------------

def get_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


# ---------------- DATABASE INITIALIZATION ----------------

def init_db():

    with get_connection() as conn:

        conn.execute("""
            CREATE TABLE IF NOT EXISTS cities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS routes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                destination TEXT NOT NULL,
                distance REAL NOT NULL CHECK(distance > 0)
            )
        """)

        city_count = conn.execute(
            "SELECT COUNT(*) FROM cities"
        ).fetchone()[0]

        if city_count == 0:

            cities = [
                ("Delhi", 28.6139, 77.2090),
                ("Jaipur", 26.9124, 75.7873),
                ("Agra", 27.1767, 78.0081),
                ("Chandigarh", 30.7333, 76.7794),
            ]

            conn.executemany(
                """
                INSERT INTO cities (name, lat, lng)
                VALUES (?, ?, ?)
                """,
                cities
            )

        route_count = conn.execute(
            "SELECT COUNT(*) FROM routes"
        ).fetchone()[0]

        if route_count == 0:

            routes = [
                ("Delhi", "Agra", 240),
                ("Agra", "Delhi", 240),

                ("Delhi", "Chandigarh", 245),
                ("Chandigarh", "Delhi", 245),

                ("Delhi", "Jaipur", 280),
                ("Jaipur", "Delhi", 280),

                ("Agra", "Jaipur", 240),
                ("Jaipur", "Agra", 240),
            ]

            conn.executemany(
                """
                INSERT INTO routes (source, destination, distance)
                VALUES (?, ?, ?)
                """,
                routes
            )


# ---------------- GRAPH DATA ----------------

def get_graph_data():

    with get_connection() as conn:

        city_rows = conn.execute(
            "SELECT name, lat, lng FROM cities"
        ).fetchall()

        route_rows = conn.execute(
            "SELECT source, destination, distance FROM routes"
        ).fetchall()

    cities = {
        row["name"]: {
            "lat": row["lat"],
            "lng": row["lng"]
        }
        for row in city_rows
    }

    graph = {}

    for row in route_rows:

        source = row["source"]
        destination = row["destination"]
        distance = float(row["distance"])

        graph.setdefault(source, []).append(
            (destination, distance)
        )

    return graph, cities


# ---------------- DIJKSTRA ALGORITHM ----------------

def dijkstra(graph, start, goal):

    priority_queue = [(0, start, [start])]
    best_distance = {}

    while priority_queue:

        cost, current_city, path = heapq.heappop(
            priority_queue
        )

        if (
            current_city in best_distance
            and cost >= best_distance[current_city]
        ):
            continue

        best_distance[current_city] = cost

        if current_city == goal:
            return cost, path

        for next_city, distance in graph.get(
            current_city, []
        ):

            if next_city not in path:

                new_cost = cost + distance

                heapq.heappush(
                    priority_queue,
                    (
                        new_cost,
                        next_city,
                        path + [next_city]
                    )
                )

    return math.inf, []


# ---------------- HOME PAGE ----------------

@app.route("/")
def home():

    _, cities = get_graph_data()

    return render_template(
        "index.html",
        cities=sorted(cities.keys())
    )


# ---------------- FIND ROUTE ----------------

@app.route("/get_route", methods=["POST"])
def get_route():

    data = request.get_json(silent=True) or {}

    source = data.get("source")
    destination = data.get("destination")
    traffic = data.get("traffic", "normal")

    if not source or not destination:

        return jsonify({
            "error": "Please select both cities."
        }), 400

    if source == destination:

        return jsonify({
            "error": "Start and destination cannot be the same."
        }), 400

    if traffic not in ["normal", "moderate", "heavy"]:
        traffic = "normal"

    graph, cities = get_graph_data()

    if source not in cities or destination not in cities:

        return jsonify({
            "error": "Selected city was not found."
        }), 400

    distance, path = dijkstra(
        graph,
        source,
        destination
    )

    if math.isinf(distance) or not path:

        return jsonify({
            "error": "No route found between these cities."
        }), 404

    coordinates = [
        [
            cities[city]["lat"],
            cities[city]["lng"]
        ]
        for city in path
    ]

    # Average speed assumption: 60 km/h

    traffic_factor = {
        "normal": 1.0,
        "moderate": 1.25,
        "heavy": 1.60
    }[traffic]

    total_minutes = (
        distance / 60
    ) * traffic_factor * 60

    hours = int(total_minutes // 60)
    minutes = round(total_minutes % 60)

    if minutes == 60:
        hours += 1
        minutes = 0

    estimated_time = (
        f"{hours} hrs {minutes} mins"
    )

    return jsonify({
        "distance": round(distance, 1),
        "path": path,
        "coordinates": coordinates,
        "estimated_time": estimated_time
    })


# ---------------- ADD NEW CITY ----------------

@app.route("/add_city", methods=["POST"])
def add_city():

    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()

    try:
        lat = float(data.get("lat"))
        lng = float(data.get("lng"))

    except (TypeError, ValueError):

        return jsonify({
            "error": "Enter valid latitude and longitude."
        }), 400

    if not name:

        return jsonify({
            "error": "City name is required."
        }), 400

    if not math.isfinite(lat) or not math.isfinite(lng):

        return jsonify({
            "error": "Coordinates must be finite numbers."
        }), 400

    if not (-90 <= lat <= 90):

        return jsonify({
            "error": "Latitude must be between -90 and 90."
        }), 400

    if not (-180 <= lng <= 180):

        return jsonify({
            "error": "Longitude must be between -180 and 180."
        }), 400

    try:

        with get_connection() as conn:

            conn.execute(
                """
                INSERT INTO cities (name, lat, lng)
                VALUES (?, ?, ?)
                """,
                (name, lat, lng)
            )

        return jsonify({
            "message": f"City '{name}' added successfully."
        })

    except sqlite3.IntegrityError:

        return jsonify({
            "error": "This city already exists."
        }), 400


# ---------------- ADD NEW ROUTE ----------------

@app.route("/add_route", methods=["POST"])
def add_route():

    data = request.get_json(silent=True) or {}

    source = str(data.get("source", "")).strip()
    destination = str(
        data.get("destination", "")
    ).strip()

    try:
        distance = float(data.get("distance"))

    except (TypeError, ValueError):

        return jsonify({
            "error": "Enter a valid distance."
        }), 400

    if not source or not destination:

        return jsonify({
            "error": "Select both cities."
        }), 400

    if source == destination:

        return jsonify({
            "error": "Choose two different cities."
        }), 400

    if not math.isfinite(distance) or distance <= 0:

        return jsonify({
            "error": "Distance must be greater than zero."
        }), 400

    try:

        with get_connection() as conn:

            city_names = {
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM cities"
                ).fetchall()
            }

            if (
                source not in city_names
                or destination not in city_names
            ):

                return jsonify({
                    "error": "Both cities must exist."
                }), 400

            existing = conn.execute(
                """
                SELECT COUNT(*) FROM routes
                WHERE (source = ? AND destination = ?)
                   OR (source = ? AND destination = ?)
                """,
                (
                    source,
                    destination,
                    destination,
                    source
                )
            ).fetchone()[0]

            if existing:

                return jsonify({
                    "error": "A route between these cities already exists."
                }), 400

            conn.executemany(
                """
                INSERT INTO routes (source, destination, distance)
                VALUES (?, ?, ?)
                """,
                [
                    (source, destination, distance),
                    (destination, source, distance)
                ]
            )

        return jsonify({
            "message": (
                f"Route added: {source} to {destination}."
            )
        })

    except sqlite3.Error:

        app.logger.exception("Database error")

        return jsonify({
            "error": "Database error while adding route."
        }), 500


# ---------------- RUN APPLICATION ----------------

if __name__ == "__main__":

    init_db()

    app.run(debug=True)

