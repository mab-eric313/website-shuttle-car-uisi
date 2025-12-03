		// import fs from "fs";
        /*
         * UISI Shuttle Tracking - Frontend untuk Mahasiswa
         * 
         * INSTRUKSI:
         * 1. File ini akan auto-connect ke backend di http://localhost:8000
         * 2. Jika backend di server lain, ganti API_BASE_URL di bawah
         * 3. Map akan auto-center ke posisi shuttle
         * 4. WebSocket untuk real-time updates
         */

        // ============================================
        // KONFIGURASI - GANTI JIKA PERLU
        // ============================================
		// const raw = fs.readFileSync("./config.json", "utf8");
		// const cfg = JSON.parse(raw);
		const resp = await fetch("/config");
		const cfg = await resp.json();

		const API_BASE_URL = `http://${cfg.HOST}:${cfg.PORT}`;  // Ganti dengan IP server jika perlu
        // Contoh: const API_BASE_URL = 'http://192.168.1.10:8000';

        // ============================================
        // GLOBAL VARIABLES
        // ============================================
        let map;
        let shuttleMarker;
        let routePolyline;
        let ws;
        let reconnectInterval;

        // ============================================
        // INITIALIZE MAP
        // ============================================
        function initMap() {
            // Center map ke area Gresik (UISI)
            map = L.map('map').setView([-7.17336, 112.64452], 16);

            // Add OpenStreetMap tiles
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(map);

            // Custom shuttle icon
            const shuttleIcon = L.divIcon({
                html: '<i class="fas fa-bus" style="color: #2563eb; font-size: 24px;"></i>',
                className: 'shuttle-marker',
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });

            // Add shuttle marker (initially hidden)
            shuttleMarker = L.marker([-7.1650, 112.6285], { icon: shuttleIcon }).addTo(map);
            shuttleMarker.bindPopup('Shuttle UISI');
        }

        // ============================================
        // THEME TOGGLE
        // ============================================
        function toggleTheme() {
            document.body.classList.toggle('dark');
            const icon = document.querySelector('.theme-toggle i');
            if (document.body.classList.contains('dark')) {
                icon.className = 'fas fa-sun';
                // Change map tiles for dark mode (optional)
                // You can add dark map tiles here
            } else {
                icon.className = 'fas fa-moon';
            }
        }

        // ============================================
        // API CALLS
        // ============================================
        async function fetchCurrentLocation() {
            try {
                const response = await fetch(`${API_BASE_URL}/api/shuttle/current`);
                if (response.ok) {
                    const data = await response.json();
                    updateShuttlePosition(data);
                    return true;
                }
            } catch (error) {
                console.error('Error fetching location:', error);
            }
            return false;
        }

        async function fetchDistance() {
            try {
                const response = await fetch(`${API_BASE_URL}/api/shuttle/distance`);
                if (response.ok) {
                    const data = await response.json();
                    document.getElementById('todayDistance').textContent = data.today_distance.toFixed(1);
                }
            } catch (error) {
                console.error('Error fetching distance:', error);
            }
        }

        async function fetchLocations() {
            try {
                const response = await fetch(`${API_BASE_URL}/api/locations`);
                if (response.ok) {
                    const locations = await response.json();
                    displayLocations(locations);
                }
            } catch (error) {
                console.error('Error fetching locations:', error);
            }
        }

        async function fetchActiveRoute() {
            try {
                const response = await fetch(`${API_BASE_URL}/api/route/active`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.active) {
                        document.getElementById('activeRouteCard').style.display = 'block';
                        document.getElementById('activeFrom').textContent = data.from;
                        document.getElementById('activeTo').textContent = data.to;
                        document.getElementById('activeEta').textContent = data.eta_minutes || '-';
                    } else {
                        document.getElementById('activeRouteCard').style.display = 'none';
                    }
                }
            } catch (error) {
                console.error('Error fetching active route:', error);
            }
        }

        // ============================================
        // UPDATE UI
        // ============================================
        function updateShuttlePosition(data) {
            const { latitude, longitude, speed } = data;
            
            // Update marker position
            shuttleMarker.setLatLng([latitude, longitude]);
            
            // Pan map to shuttle position
            map.panTo([latitude, longitude]);
            
            // Update speed
            document.getElementById('currentSpeed').textContent = Math.round(speed);
            
            // Update status
            const statusBadge = document.getElementById('shuttleStatus');
            statusBadge.className = 'status-badge connected';
            statusBadge.innerHTML = '<div class="pulse"></div><span>Shuttle Aktif</span>';
            
            document.getElementById('shuttleStatusText').innerHTML = '<i class="fas fa-circle"></i> Aktif';
        }

        function displayLocations(locations) {
            const routeList = document.getElementById('routeList');
            routeList.innerHTML = '';
            
            locations.forEach((loc, index) => {
                const name = loc.location_name.split(' - ')[0];
                const item = document.createElement('div');
                item.className = 'route-item';
                item.innerHTML = `
                    <div class="route-marker">${index + 1}</div>
                    <div class="route-info">
                        <div class="route-name">${name}</div>
                        <div class="route-eta">Menunggu data shuttle...</div>
                    </div>
                    <i class="fas fa-map-marker-alt route-icon"></i>
                `;
                routeList.appendChild(item);
                
                // Add marker to map
                L.marker([loc.latitude, loc.longitude])
                    .addTo(map)
                    .bindPopup(`<strong>${name}</strong>`);
            });
        }

        // ============================================
        // WEBSOCKET
        // ============================================
        function connectWebSocket() {
            const wsUrl = API_BASE_URL.replace('http', 'ws') + '/ws/tracking';
            
            try {
                ws = new WebSocket(wsUrl);
                
                ws.onopen = () => {
                    console.log('✅ WebSocket connected');
                    document.getElementById('connectionAlert').innerHTML = 
                        '<i class="fas fa-check-circle"></i><span>Connected to server - Real-time updates active</span>';
                    document.getElementById('connectionAlert').className = 'alert alert-info';
                    
                    if (reconnectInterval) {
                        clearInterval(reconnectInterval);
                        reconnectInterval = null;
                    }
                };
                
                ws.onmessage = (event) => {
                    const message = JSON.parse(event.data);
                    
                    if (message.type === 'location_update') {
                        updateShuttlePosition(message.data);
                    } else if (message.type === 'new_route_request') {
                        fetchActiveRoute();
                    }
                };
                
                ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                };
                
                ws.onclose = () => {
                    console.log('❌ WebSocket disconnected');
                    document.getElementById('connectionAlert').innerHTML = 
                        '<i class="fas fa-exclamation-triangle"></i><span>Disconnected from server - Reconnecting...</span>';
                    document.getElementById('connectionAlert').className = 'alert alert-warning';
                    
                    // Try to reconnect
                    if (!reconnectInterval) {
                        reconnectInterval = setInterval(() => {
                            console.log('Attempting to reconnect...');
                            connectWebSocket();
                        }, 5000);
                    }
                };
            } catch (error) {
                console.error('Failed to connect WebSocket:', error);
            }
        }

        // ============================================
        // INITIALIZE APP
        // ============================================
        async function init() {
            console.log('🚀 Initializing UISI Shuttle Tracking...');
            
            // Initialize map
            initMap();
            
            // Fetch initial data
            await fetchLocations();
            await fetchDistance();
            await fetchActiveRoute();
            
            // Try to fetch current location
            const hasLocation = await fetchCurrentLocation();
            if (!hasLocation) {
                document.getElementById('shuttleStatus').innerHTML = 
                    '<div class="pulse"></div><span>Menunggu GPS...</span>';
            }
            
            // Connect WebSocket for real-time updates
            connectWebSocket();
            
            // Update data periodically (fallback jika WebSocket fail)
            setInterval(async () => {
                await fetchDistance();
                await fetchActiveRoute();
                
                // If WebSocket not connected, poll location
                if (ws.readyState !== WebSocket.OPEN) {
                    await fetchCurrentLocation();
                }
            }, 10000); // Every 10 seconds
            
            console.log('✅ App initialized');
        }

        // Start app when page loads
        window.addEventListener('load', init);

        // Handle page unload
        window.addEventListener('beforeunload', () => {
            if (ws) {
                ws.close();
            }
        });

