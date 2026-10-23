
(() => {
    "use strict";

    const byId = (id) => document.getElementById(id);

    let map = null;
    let routeLine = null;
    let routeMarkers = [];


    // ---------------- DISPLAY MESSAGE ----------------

    function setMessage(message, type = "") {

        const box = byId("result");

        box.textContent = message;
        box.className = "notice";

        if (type) {
            box.classList.add(type);
        }
    }


    // ---------------- CLEAR PREVIOUS ROUTE ----------------

    function clearRouteDisplay() {

        byId("distanceValue").textContent = "-- km";
        byId("timeValue").textContent = "--";
        byId("trafficValue").textContent = "--";
        byId("pathValue").textContent =
            "Your route will appear here.";

        if (map && routeLine) {

            map.removeLayer(routeLine);
            routeLine = null;
        }

        if (map) {

            routeMarkers.forEach((marker) => {
                map.removeLayer(marker);
            });
        }

        routeMarkers = [];
    }


    // ---------------- INITIALIZE MAP ----------------

    function initMap() {

        const mapElement = byId("map");

        if (!mapElement) {

            console.error(
                "Map container #map was not found."
            );

            return;
        }

        if (typeof window.L === "undefined") {

            mapElement.textContent =
                "Map library could not load. Check your internet connection and refresh the page.";

            mapElement.style.padding = "16px";

            console.error(
                "Leaflet library is missing."
            );

            return;
        }

        map = L.map(mapElement).setView(
            [28.6139, 77.2090],
            6
        );

        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                maxZoom: 19,
                attribution:
                    "&copy; OpenStreetMap contributors"
            }
        ).addTo(map);

        window.setTimeout(() => {
            map.invalidateSize();
        }, 200);
    }


    // ---------------- FIND SHORTEST ROUTE ----------------

    async function findRoute() {

        const source = byId("source").value;
        const destination = byId("destination").value;
        const traffic = byId("traffic").value;

        const button = byId("findBtn");

        if (!source || !destination) {

            setMessage(
                "Please select both cities.",
                "error"
            );

            return;
        }

        if (source === destination) {

            clearRouteDisplay();

            setMessage(
                "Starting city and destination cannot be the same.",
                "error"
            );

            return;
        }

        button.disabled = true;
        button.textContent = "Finding route...";

        setMessage("Calculating the shortest route...");

        try {

            const response = await fetch("/get_route", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    source: source,
                    destination: destination,
                    traffic: traffic
                })
            });

            const data = await response.json();

            if (!response.ok || data.error) {

                throw new Error(
                    data.error || "Could not find a route."
                );
            }

            // Update distance

            byId("distanceValue").textContent =
                `${data.distance} km`;

            // Update travel time

            byId("timeValue").textContent =
                data.estimated_time;

            // Update traffic mode

            const trafficNames = {
                normal: "Normal",
                moderate: "Moderate",
                heavy: "Heavy"
            };

            byId("trafficValue").textContent =
                trafficNames[traffic] || "Normal";

            // Display city path

            byId("pathValue").textContent =
                data.path.join(" → ");

            setMessage(
                "Shortest route found successfully!",
                "success"
            );

            drawRoute(data);

        } catch (error) {

            clearRouteDisplay();

            setMessage(
                error.message || "An unexpected error occurred.",
                "error"
            );

            console.error(
                "Route search failed:",
                error
            );

        } finally {

            button.disabled = false;
            button.textContent = "Find Shortest Route";
        }
    }


    // ---------------- DRAW ROUTE ON MAP ----------------

    function drawRoute(data) {

        if (!map) {

            setMessage(
                "Route was calculated, but the map did not load. Check your internet connection.",
                "error"
            );

            return;
        }

        // Remove previous route line

        if (routeLine) {

            map.removeLayer(routeLine);
            routeLine = null;
        }

        // Remove previous markers

        routeMarkers.forEach((marker) => {
            map.removeLayer(marker);
        });

        routeMarkers = [];

        if (
            !Array.isArray(data.coordinates) ||
            data.coordinates.length === 0
        ) {
            return;
        }

        // Draw route line

        routeLine = L.polyline(
            data.coordinates,
            {
                color: "#1769d2",
                weight: 5,
                opacity: 0.9
            }
        ).addTo(map);

        // Add city markers

        data.coordinates.forEach(
            (coordinates, index) => {

                const cityName =
                    data.path[index] || `Stop ${index + 1}`;

                const marker = L.marker(
                    coordinates
                )
                    .addTo(map)
                    .bindPopup(
                        `<strong>${escapeHTML(cityName)}</strong>`
                    );

                routeMarkers.push(marker);
            }
        );

        // Adjust map view

        if (data.coordinates.length === 1) {

            map.setView(data.coordinates[0], 10);

        } else {

            map.fitBounds(
                routeLine.getBounds(),
                {
                    padding: [30, 30]
                }
            );
        }

        window.setTimeout(() => {
            map.invalidateSize();
        }, 100);
    }


    // ---------------- ESCAPE HTML ----------------

    function escapeHTML(value) {

        return String(value).replace(
            /[&<>"']/g,

            (character) => ({

                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"

            })[character]
        );
    }


    // ---------------- ADMIN CITY SELECTS ----------------

    function fillCitySelects(cityName) {

        [
            "source",
            "destination",
            "routeSource",
            "routeDest"
        ].forEach((id) => {

            const select = byId(id);

            const exists = Array.from(
                select.options
            ).some(
                (option) => option.value === cityName
            );

            if (!exists) {

                const option =
                    document.createElement("option");

                option.value = cityName;
                option.textContent = cityName;

                select.appendChild(option);
            }
        });
    }


    // ---------------- SEND JSON REQUEST ----------------

    async function submitJSON(url, payload) {

        const response = await fetch(url, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(
            () => ({})
        );

        if (!response.ok) {

            throw new Error(
                data.error || "The request failed."
            );
        }

        return data;
    }


    // ---------------- SETUP EVENTS ----------------

    function attachEvents() {

        // Find Route

        byId("routeForm").addEventListener(
            "submit",
            (event) => {

                event.preventDefault();

                findRoute();
            }
        );


        // Swap Cities

        byId("swapBtn").addEventListener(
            "click",
            () => {

                const source = byId("source");
                const destination = byId("destination");

                const oldSource = source.value;

                source.value = destination.value;
                destination.value = oldSource;

                clearRouteDisplay();

                setMessage(
                    "Cities swapped. Click Find Shortest Route."
                );
            }
        );


        // Toggle Admin Panel

        byId("adminToggle").addEventListener(
            "click",
            () => {

                const panel = byId("adminPanel");

                const opening = panel.hidden;

                panel.hidden = !opening;

                byId("adminToggle").setAttribute(
                    "aria-expanded",
                    String(opening)
                );

                byId("adminToggle").textContent =
                    opening
                        ? "Close Admin Panel"
                        : "Open Admin Panel";

                if (opening && map) {

                    window.setTimeout(() => {
                        map.invalidateSize();
                    }, 100);
                }
            }
        );


        // Add City

        byId("cityForm").addEventListener(
            "submit",
            async (event) => {

                event.preventDefault();

                const name =
                    byId("newCityName").value.trim();

                const lat =
                    byId("newCityLat").value;

                const lng =
                    byId("newCityLng").value;

                try {

                    const data = await submitJSON(
                        "/add_city",
                        {
                            name: name,
                            lat: lat,
                            lng: lng
                        }
                    );

                    alert(
                        data.message || "City added successfully."
                    );

                    window.location.reload();

                } catch (error) {

                    alert(
                        error.message || "Could not add city."
                    );
                }
            }
        );


        // Add Route

        byId("routeFormAdmin").addEventListener(
            "submit",
            async (event) => {

                event.preventDefault();

                const source =
                    byId("routeSource").value;

                const destination =
                    byId("routeDest").value;

                const distance =
                    byId("routeDist").value;

                if (source === destination) {

                    alert(
                        "Please choose two different cities."
                    );

                    return;
                }

                if (
                    !Number.isFinite(Number(distance)) ||
                    Number(distance) <= 0
                ) {

                    alert(
                        "Distance must be greater than zero."
                    );

                    return;
                }

                try {

                    const data = await submitJSON(
                        "/add_route",
                        {
                            source: source,
                            destination: destination,
                            distance: distance
                        }
                    );

                    alert(
                        data.message || "Route added successfully."
                    );

                    window.location.reload();

                } catch (error) {

                    alert(
                        error.message || "Could not add route."
                    );
                }
            }
        );
    }


    // ---------------- PAGE INITIALIZATION ----------------

    document.addEventListener(
        "DOMContentLoaded",
        () => {

            initMap();

            attachEvents();
        }
    );

})();

