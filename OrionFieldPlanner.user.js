// ==UserScript==
// @id             iitc-plugin-orion-field-planner
// @name           IITC plugin: Orion Field Planner
// @category       Misc
// @version        1.0.0
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    'use strict';

    if (!plugin_info) plugin_info = {};
    if (!plugin_info.script) plugin_info.script = {};

    plugin_info.pluginId = 'orion-field-planner';
    plugin_info.script.version = plugin_info.script.version;

    if (typeof window.plugin === 'undefined') {
        window.plugin = function () {};
    }

    window.plugin.orionFieldPlanner = window.plugin.orionFieldPlanner || {};
    var OFP = window.plugin.orionFieldPlanner;

    OFP.VERSION = plugin_info.script.version;
    OFP.DEFAULT_SEED = 'orion-v1';

    OFP.state = {
        uiMode: 'idle',
        stage: 'ready',
        canUndo: false,
        lastSeed: OFP.DEFAULT_SEED,
        lastSummary: 'No run yet.',
        lastError: ''
    };

    OFP.setState = function setState(patch) {
        Object.keys(patch).forEach(function (key) {
            OFP.state[key] = patch[key];
        });
        OFP.refreshPanel();
    };

    OFP.readOptions = function readOptions() {
        var seedInput = document.getElementById('ofp-seed-input');
        var orionInput = document.getElementById('ofp-orion-checkbox');
        var hierarchyInput = document.getElementById('ofp-hierarchy-checkbox');

        var seed = seedInput ? seedInput.value.trim() : '';
        if (!seed) seed = OFP.DEFAULT_SEED;

        return {
            seed: seed,
            useOrionAssignment: !!(orionInput && orionInput.checked),
            useHierarchyColoring: !!(hierarchyInput && hierarchyInput.checked)
        };
    };

    OFP.normalizeDrawToolsType = function normalizeDrawToolsType(value) {
        if (!value) return null;

        var type = String(value).toLowerCase();

        if (type === 'polygon') return 'polygon';
        if (type === 'polyline') return 'polyline';
        if (type === 'marker') return 'marker';
        if (type === 'circle') return 'circle';

        return null;
    };

    OFP.getDrawToolsExplicitType = function getDrawToolsExplicitType(layer) {
        if (!layer) return null;

        var candidates = [];

        candidates.push(layer.type);
        candidates.push(layer._type);

        if (layer.options) {
            candidates.push(layer.options.type);
            candidates.push(layer.options.drawToolsType);
            candidates.push(layer.options.itemType);
        }

        if (layer.feature && layer.feature.properties) {
            candidates.push(layer.feature.properties.type);
            candidates.push(layer.feature.properties.drawToolsType);
            candidates.push(layer.feature.properties.itemType);
        }

        for (var i = 0; i < candidates.length; i += 1) {
            var normalized = OFP.normalizeDrawToolsType(candidates[i]);
            if (normalized) return normalized;
        }

        return null;
    };

    OFP.getDrawToolsLayerKind = function getDrawToolsLayerKind(layer) {
        if (!layer) return 'unsupported';

        var explicitType = OFP.getDrawToolsExplicitType(layer);
        if (explicitType) return explicitType;

        // Circle must be checked before polygon-like classes.
        // Some Draw Tools circle objects may expose polygon-like geometry.
        if (typeof layer.getRadius === 'function' && typeof layer.getLatLng === 'function') {
            return 'circle';
        }

        if (typeof L !== 'undefined') {
            if (typeof L.Circle === 'function' && layer instanceof L.Circle) {
                return 'circle';
            }

            if (typeof L.GeodesicPolygon === 'function' && layer instanceof L.GeodesicPolygon) {
                return 'polygon';
            }

            if (typeof L.Polygon === 'function' && layer instanceof L.Polygon) {
                return 'polygon';
            }

            if (typeof L.GeodesicPolyline === 'function' && layer instanceof L.GeodesicPolyline) {
                return 'polyline';
            }

            if (typeof L.Polyline === 'function' && layer instanceof L.Polyline) {
                return 'polyline';
            }

            if (typeof L.Marker === 'function' && layer instanceof L.Marker) {
                return 'marker';
            }
        }

        if (typeof layer.toGeoJSON === 'function') {
            try {
                var geo = layer.toGeoJSON();
                var type = geo && geo.geometry && geo.geometry.type;

                if (type === 'Polygon' || type === 'MultiPolygon') {
                    return 'polygon';
                }

                if (type === 'LineString' || type === 'MultiLineString') {
                    return 'polyline';
                }

                if (type === 'Point') {
                    return 'marker';
                }
            } catch (e) {
                return 'unsupported';
            }
        }

        return 'unsupported';
    };

    OFP.readDrawToolsSummary = function readDrawToolsSummary() {
        if (!window.plugin || !window.plugin.drawTools) {
            throw new Error('Draw Tools is not available.');
        }

        if (!window.plugin.drawTools.drawnItems) {
            throw new Error('Draw Tools drawnItems layer is not available.');
        }

        var drawnItems = window.plugin.drawTools.drawnItems;

        if (typeof drawnItems.eachLayer !== 'function') {
            throw new Error('Draw Tools drawnItems does not support eachLayer.');
        }

        var summary = {
            total: 0,
            polygons: 0,
            polylines: 0,
            markers: 0,
            circles: 0,
            unsupported: 0
        };

        drawnItems.eachLayer(function (layer) {
            summary.total += 1;

            var kind = OFP.getDrawToolsLayerKind(layer);

            if (kind === 'polygon') {
                summary.polygons += 1;
            } else if (kind === 'polyline') {
                summary.polylines += 1;
            } else if (kind === 'marker') {
                summary.markers += 1;
            } else if (kind === 'circle') {
                summary.circles += 1;
            } else {
                summary.unsupported += 1;
            }
        });

        return summary;
    };

    OFP.formatDrawToolsSummary = function formatDrawToolsSummary(summary, options) {
        return [
            'Draw Tools read succeeded.',
            'Seed: ' + options.seed,
            'Orion: ' + String(options.useOrionAssignment),
            'Hierarchy: ' + String(options.useHierarchyColoring),
            '',
            'Draw items:',
            '- total: ' + String(summary.total),
            '- polygons: ' + String(summary.polygons),
            '- polylines: ' + String(summary.polylines),
            '- markers: ' + String(summary.markers),
            '- circles: ' + String(summary.circles),
            '- unsupported: ' + String(summary.unsupported),
            '',
            'Core completion pipeline is not implemented yet.'
        ].join('\n');
    };

    OFP.makeDiagnostic = function makeDiagnostic(level, code, message, details) {
        return {
            level: level,
            module: 'drawtools_adapter',
            stage: 'read_drawtools',
            code: code,
            message: message,
            details: details || null,
            timestamp: new Date().toISOString()
        };
    };

    OFP.getLayerTypeName = function getLayerTypeName(layer) {
        if (!layer) return 'null';
        if (layer.constructor && layer.constructor.name) return layer.constructor.name;
        return typeof layer;
    };

    OFP.latLngToPlain = function latLngToPlain(latlng) {
        return {
            lat: Number(latlng.lat),
            lng: Number(latlng.lng)
        };
    };

    OFP.coordToLatLng = function coordToLatLng(coord) {
        return {
            lat: Number(coord[1]),
            lng: Number(coord[0])
        };
    };

    OFP.isLatLngLike = function isLatLngLike(value) {
        return !!value &&
            typeof value.lat === 'number' &&
            typeof value.lng === 'number';
    };

    OFP.collectLatLngPaths = function collectLatLngPaths(value, output) {
        if (!Array.isArray(value) || value.length === 0) return;

        if (OFP.isLatLngLike(value[0])) {
            output.push(value.map(OFP.latLngToPlain));
            return;
        }

        value.forEach(function (child) {
            OFP.collectLatLngPaths(child, output);
        });
    };

    OFP.extractPolygonGeometryFromGeoJson = function extractPolygonGeometryFromGeoJson(geo) {
        var geometry = geo && geo.geometry;
        if (!geometry) return [];

        if (geometry.type === 'Polygon') {
            return [
                {
                    outerRing: geometry.coordinates[0].map(OFP.coordToLatLng),
                    holes: geometry.coordinates.slice(1).map(function (ring) {
                        return ring.map(OFP.coordToLatLng);
                    })
                }
            ];
        }

        if (geometry.type === 'MultiPolygon') {
            return geometry.coordinates.map(function (polygonCoords) {
                return {
                    outerRing: polygonCoords[0].map(OFP.coordToLatLng),
                    holes: polygonCoords.slice(1).map(function (ring) {
                        return ring.map(OFP.coordToLatLng);
                    })
                };
            });
        }

        return [];
    };

    OFP.extractPolylineGeometryFromGeoJson = function extractPolylineGeometryFromGeoJson(geo) {
        var geometry = geo && geo.geometry;
        if (!geometry) return [];

        if (geometry.type === 'LineString') {
            return [
                geometry.coordinates.map(OFP.coordToLatLng)
            ];
        }

        if (geometry.type === 'MultiLineString') {
            return geometry.coordinates.map(function (lineCoords) {
                return lineCoords.map(OFP.coordToLatLng);
            });
        }

        return [];
    };

    OFP.importPolygonLayer = function importPolygonLayer(layer, sourceIndex, diagnostics) {
        var polygons = [];

        if (typeof layer.toGeoJSON === 'function') {
            try {
                polygons = OFP.extractPolygonGeometryFromGeoJson(layer.toGeoJSON());
            } catch (e) {
                diagnostics.warnings.push(OFP.makeDiagnostic(
                    'warning',
                    'POLYGON_GEOJSON_FAILED',
                    'Failed to read polygon through GeoJSON.',
                    {
                        sourceIndex: sourceIndex,
                        error: e && e.message ? e.message : String(e)
                    }
                ));
            }
        }

        if (!polygons.length) {
            var rawLatLngs = null;

            if (typeof layer.getLatLngs === 'function') {
                rawLatLngs = layer.getLatLngs();
            } else if (layer._latlngs) {
                rawLatLngs = layer._latlngs;
            }

            if (rawLatLngs) {
                var rings = [];
                OFP.collectLatLngPaths(rawLatLngs, rings);

                if (rings.length) {
                    polygons = [
                        {
                            outerRing: rings[0],
                            holes: rings.slice(1)
                        }
                    ];
                }
            }
        }

        if (!polygons.length) {
            diagnostics.warnings.push(OFP.makeDiagnostic(
                'warning',
                'EMPTY_POLYGON_GEOMETRY',
                'A polygon layer was found, but no polygon geometry could be extracted.',
                {
                    sourceIndex: sourceIndex,
                    typeName: OFP.getLayerTypeName(layer)
                }
            ));
        }

        return {
            type: 'polygon',
            sourceIndex: sourceIndex,
            typeName: OFP.getLayerTypeName(layer),
            polygons: polygons
        };
    };

    OFP.importPolylineLayer = function importPolylineLayer(layer, sourceIndex, diagnostics) {
        var paths = [];

        if (typeof layer.toGeoJSON === 'function') {
            try {
                paths = OFP.extractPolylineGeometryFromGeoJson(layer.toGeoJSON());
            } catch (e) {
                diagnostics.warnings.push(OFP.makeDiagnostic(
                    'warning',
                    'POLYLINE_GEOJSON_FAILED',
                    'Failed to read polyline through GeoJSON.',
                    {
                        sourceIndex: sourceIndex,
                        error: e && e.message ? e.message : String(e)
                    }
                ));
            }
        }

        if (!paths.length) {
            var rawLatLngs = null;

            if (typeof layer.getLatLngs === 'function') {
                rawLatLngs = layer.getLatLngs();
            } else if (layer._latlngs) {
                rawLatLngs = layer._latlngs;
            }

            if (rawLatLngs) {
                OFP.collectLatLngPaths(rawLatLngs, paths);
            }
        }

        if (!paths.length) {
            diagnostics.warnings.push(OFP.makeDiagnostic(
                'warning',
                'EMPTY_POLYLINE_GEOMETRY',
                'A polyline layer was found, but no polyline geometry could be extracted.',
                {
                    sourceIndex: sourceIndex,
                    typeName: OFP.getLayerTypeName(layer)
                }
            ));
        }

        return {
            type: 'polyline',
            sourceIndex: sourceIndex,
            typeName: OFP.getLayerTypeName(layer),
            paths: paths
        };
    };

    OFP.importMarkerLayer = function importMarkerLayer(layer, sourceIndex, diagnostics) {
        if (typeof layer.getLatLng !== 'function') {
            diagnostics.warnings.push(OFP.makeDiagnostic(
                'warning',
                'MARKER_LATLNG_MISSING',
                'A marker layer was found, but getLatLng is not available.',
                {
                    sourceIndex: sourceIndex,
                    typeName: OFP.getLayerTypeName(layer)
                }
            ));

            return {
                type: 'marker',
                sourceIndex: sourceIndex,
                typeName: OFP.getLayerTypeName(layer),
                latLng: null
            };
        }

        return {
            type: 'marker',
            sourceIndex: sourceIndex,
            typeName: OFP.getLayerTypeName(layer),
            latLng: OFP.latLngToPlain(layer.getLatLng())
        };
    };

    OFP.importCircleLayer = function importCircleLayer(layer, sourceIndex, diagnostics) {
        var center = null;
        var radius = null;

        if (typeof layer.getLatLng === 'function') {
            center = OFP.latLngToPlain(layer.getLatLng());
        } else if (layer._latlng) {
            center = OFP.latLngToPlain(layer._latlng);
        } else if (layer.options && layer.options.latLng) {
            center = OFP.latLngToPlain(layer.options.latLng);
        }

        if (typeof layer.getRadius === 'function') {
            radius = Number(layer.getRadius());
        } else if (typeof layer._mRadius === 'number') {
            radius = Number(layer._mRadius);
        } else if (layer.options && typeof layer.options.radius === 'number') {
            radius = Number(layer.options.radius);
        }

        if (!center || !isFinite(radius)) {
            diagnostics.warnings.push(OFP.makeDiagnostic(
                'warning',
                'CIRCLE_GEOMETRY_INCOMPLETE',
                'A circle layer was found, but center or radius could not be extracted.',
                {
                    sourceIndex: sourceIndex,
                    typeName: OFP.getLayerTypeName(layer),
                    hasCenter: !!center,
                    radius: radius
                }
            ));
        }

        return {
            type: 'circle',
            sourceIndex: sourceIndex,
            typeName: OFP.getLayerTypeName(layer),
            center: center,
            radius: radius
        };
    };

    OFP.readDrawToolsAdapterResult = function readDrawToolsAdapterResult() {
        if (!window.plugin || !window.plugin.drawTools) {
            throw new Error('Draw Tools is not available.');
        }

        if (!window.plugin.drawTools.drawnItems) {
            throw new Error('Draw Tools drawnItems layer is not available.');
        }

        var drawnItems = window.plugin.drawTools.drawnItems;

        if (typeof drawnItems.eachLayer !== 'function') {
            throw new Error('Draw Tools drawnItems does not support eachLayer.');
        }

        var diagnostics = {
            errors: [],
            warnings: []
        };

        var result = {
            rawPolygons: [],
            rawPolylines: [],
            rawMarkers: [],
            rawCircles: [],
            ignoredObjects: [],
            diagnostics: diagnostics,
            metadata: {
                timestamp: new Date().toISOString(),
                counts: {
                    total: 0,
                    polygons: 0,
                    polylines: 0,
                    markers: 0,
                    circles: 0,
                    unsupported: 0
                }
            }
        };

        var sourceIndex = 0;

        drawnItems.eachLayer(function (layer) {
            var kind = OFP.getDrawToolsLayerKind(layer);

            result.metadata.counts.total += 1;

            if (kind === 'polygon') {
                result.metadata.counts.polygons += 1;
                result.rawPolygons.push(OFP.importPolygonLayer(layer, sourceIndex, diagnostics));
            } else if (kind === 'polyline') {
                result.metadata.counts.polylines += 1;
                result.rawPolylines.push(OFP.importPolylineLayer(layer, sourceIndex, diagnostics));
            } else if (kind === 'marker') {
                result.metadata.counts.markers += 1;
                result.rawMarkers.push(OFP.importMarkerLayer(layer, sourceIndex, diagnostics));
            } else if (kind === 'circle') {
                result.metadata.counts.circles += 1;
                result.rawCircles.push(OFP.importCircleLayer(layer, sourceIndex, diagnostics));
            } else {
                result.metadata.counts.unsupported += 1;
                result.ignoredObjects.push({
                    sourceIndex: sourceIndex,
                    kind: 'unsupported',
                    typeName: OFP.getLayerTypeName(layer)
                });

                diagnostics.warnings.push(OFP.makeDiagnostic(
                    'warning',
                    'UNSUPPORTED_DRAWTOOLS_OBJECT',
                    'An unsupported draw tools object was ignored.',
                    {
                        sourceIndex: sourceIndex,
                        typeName: OFP.getLayerTypeName(layer)
                    }
                ));
            }

            sourceIndex += 1;
        });

        return result;
    };

    OFP.formatAdapterResultSummary = function formatAdapterResultSummary(adapterResult, options) {
        var counts = adapterResult.metadata.counts;

        return [
            'Draw Tools adapter import succeeded.',
            'Seed: ' + options.seed,
            'Orion: ' + String(options.useOrionAssignment),
            'Hierarchy: ' + String(options.useHierarchyColoring),
            '',
            'Raw objects:',
            '- rawPolygons: ' + String(adapterResult.rawPolygons.length),
            '- rawPolylines: ' + String(adapterResult.rawPolylines.length),
            '- rawMarkers: ' + String(adapterResult.rawMarkers.length),
            '- rawCircles: ' + String(adapterResult.rawCircles.length),
            '- ignoredObjects: ' + String(adapterResult.ignoredObjects.length),
            '',
            'Layer counts:',
            '- total: ' + String(counts.total),
            '- polygons: ' + String(counts.polygons),
            '- polylines: ' + String(counts.polylines),
            '- markers: ' + String(counts.markers),
            '- circles: ' + String(counts.circles),
            '- unsupported: ' + String(counts.unsupported),
            '',
            'Diagnostics:',
            '- errors: ' + String(adapterResult.diagnostics.errors.length),
            '- warnings: ' + String(adapterResult.diagnostics.warnings.length),
            '',
            'Portal matching is not implemented yet.',
            'Core completion pipeline is not implemented yet.'
        ].join('\n');
    };

    OFP.makePortalDiagnostic = function makePortalDiagnostic(level, code, message, details) {
        return {
            level: level,
            module: 'portal_snapshot_reader',
            stage: 'read_portal_snapshot',
            code: code,
            message: message,
            details: details || null,
            timestamp: new Date().toISOString()
        };
    };

    OFP.getPortalLatLng = function getPortalLatLng(portal) {
        if (!portal) return null;

        if (typeof portal.getLatLng === 'function') {
            return OFP.latLngToPlain(portal.getLatLng());
        }

        if (portal._latlng) {
            return OFP.latLngToPlain(portal._latlng);
        }

        if (portal.options && portal.options.latLng) {
            return OFP.latLngToPlain(portal.options.latLng);
        }

        if (portal.options && portal.options.data) {
            var data = portal.options.data;

            if (typeof data.latE6 === 'number' && typeof data.lngE6 === 'number') {
                return {
                    lat: data.latE6 / 1000000,
                    lng: data.lngE6 / 1000000
                };
            }

            if (typeof data.lat === 'number' && typeof data.lng === 'number') {
                return {
                    lat: data.lat,
                    lng: data.lng
                };
            }
        }

        return null;
    };

    OFP.getPortalTitle = function getPortalTitle(portal) {
        if (!portal) return null;

        if (portal.options && portal.options.data && portal.options.data.title) {
            return String(portal.options.data.title);
        }

        if (portal.options && portal.options.title) {
            return String(portal.options.title);
        }

        if (portal.title) {
            return String(portal.title);
        }

        return null;
    };

    OFP.getPortalGuid = function getPortalGuid(guid, portal) {
        if (guid) return String(guid);

        if (portal && portal.options && portal.options.guid) {
            return String(portal.options.guid);
        }

        if (portal && portal.options && portal.options.data && portal.options.data.guid) {
            return String(portal.options.data.guid);
        }

        if (portal && portal.guid) {
            return String(portal.guid);
        }

        return null;
    };

    OFP.getPortalLatLngKey = function getPortalLatLngKey(latLng) {
        if (!latLng) return null;

        return Number(latLng.lat).toFixed(6) + ',' + Number(latLng.lng).toFixed(6);
    };

    OFP.getMapBoundsSnapshot = function getMapBoundsSnapshot() {
        if (!window.map || typeof window.map.getBounds !== 'function') {
            return null;
        }

        try {
            var bounds = window.map.getBounds();
            var southWest = bounds.getSouthWest();
            var northEast = bounds.getNorthEast();

            return {
                southWest: OFP.latLngToPlain(southWest),
                northEast: OFP.latLngToPlain(northEast)
            };
        } catch (e) {
            return null;
        }
    };

    OFP.getMapZoomSnapshot = function getMapZoomSnapshot() {
        if (!window.map || typeof window.map.getZoom !== 'function') {
            return null;
        }

        try {
            return Number(window.map.getZoom());
        } catch (e) {
            return null;
        }
    };

    OFP.makePortalRef = function makePortalRef(guid, portal, sourceIndex, diagnostics) {
        var portalGuid = OFP.getPortalGuid(guid, portal);
        var latLng = OFP.getPortalLatLng(portal);
        var title = OFP.getPortalTitle(portal);

        if (!portalGuid) {
            diagnostics.warnings.push(OFP.makePortalDiagnostic(
                'warning',
                'PORTAL_GUID_MISSING',
                'A portal was found, but its guid could not be extracted.',
                {
                    sourceIndex: sourceIndex
                }
            ));
        }

        if (!latLng) {
            diagnostics.warnings.push(OFP.makePortalDiagnostic(
                'warning',
                'PORTAL_LATLNG_MISSING',
                'A portal was found, but its coordinates could not be extracted.',
                {
                    sourceIndex: sourceIndex,
                    guid: portalGuid
                }
            ));
        }

        if (!portalGuid || !latLng) {
            return null;
        }

        return {
            id: portalGuid,
            guid: portalGuid,
            latLng: latLng,
            label: title,
            metadata: {
                sourceIndex: sourceIndex,
                latLngKey: OFP.getPortalLatLngKey(latLng)
            }
        };
    };

    OFP.readPortalSnapshot = function readPortalSnapshot() {
        var diagnostics = {
            errors: [],
            warnings: []
        };

        var snapshot = {
            portalMap: {},
            loadedPortalIds: [],
            indexByLatLng: {},
            indexByGuid: {},
            bounds: OFP.getMapBoundsSnapshot(),
            zoom: OFP.getMapZoomSnapshot(),
            timestamp: new Date().toISOString(),
            diagnostics: diagnostics,
            metadata: {
                counts: {
                    portals: 0,
                    latLngIndexKeys: 0,
                    duplicateCoordinateKeys: 0,
                    skippedPortals: 0
                }
            }
        };

        if (!window.portals) {
            diagnostics.warnings.push(OFP.makePortalDiagnostic(
                'warning',
                'WINDOW_PORTALS_MISSING',
                'window.portals is not available.',
                null
            ));

            return snapshot;
        }

        var portalGuids = Object.keys(window.portals);
        var sourceIndex = 0;

        portalGuids.forEach(function (guid) {
            var portal = window.portals[guid];
            var portalRef = OFP.makePortalRef(guid, portal, sourceIndex, diagnostics);

            if (!portalRef) {
                snapshot.metadata.counts.skippedPortals += 1;
                sourceIndex += 1;
                return;
            }

            snapshot.portalMap[portalRef.id] = portalRef;
            snapshot.indexByGuid[portalRef.guid] = portalRef;
            snapshot.loadedPortalIds.push(portalRef.id);

            var latLngKey = portalRef.metadata.latLngKey;

            if (!snapshot.indexByLatLng[latLngKey]) {
                snapshot.indexByLatLng[latLngKey] = [];
            }

            snapshot.indexByLatLng[latLngKey].push(portalRef.id);

            sourceIndex += 1;
        });

        snapshot.metadata.counts.portals = snapshot.loadedPortalIds.length;
        snapshot.metadata.counts.latLngIndexKeys = Object.keys(snapshot.indexByLatLng).length;

        Object.keys(snapshot.indexByLatLng).forEach(function (key) {
            if (snapshot.indexByLatLng[key].length > 1) {
                snapshot.metadata.counts.duplicateCoordinateKeys += 1;
            }
        });

        if (snapshot.loadedPortalIds.length === 0) {
            diagnostics.warnings.push(OFP.makePortalDiagnostic(
                'warning',
                'NO_LOADED_PORTALS',
                'No loaded portals were found in the current IITC view.',
                {
                    zoom: snapshot.zoom,
                    bounds: snapshot.bounds
                }
            ));
        }

        if (snapshot.metadata.counts.duplicateCoordinateKeys > 0) {
            diagnostics.warnings.push(OFP.makePortalDiagnostic(
                'warning',
                'DUPLICATE_PORTAL_COORDINATES',
                'Some loaded portals share the same coordinate key.',
                {
                    duplicateCoordinateKeys: snapshot.metadata.counts.duplicateCoordinateKeys
                }
            ));
        }

        return snapshot;
    };

    OFP.formatPortalSnapshotSummaryLines = function formatPortalSnapshotSummaryLines(portalSnapshot) {
        var counts = portalSnapshot.metadata.counts;

        return [
            'Portal Snapshot:',
            '- loaded portals: ' + String(counts.portals),
            '- latLng index keys: ' + String(counts.latLngIndexKeys),
            '- duplicate coordinate keys: ' + String(counts.duplicateCoordinateKeys),
            '- skipped portals: ' + String(counts.skippedPortals),
            '- warnings: ' + String(portalSnapshot.diagnostics.warnings.length),
            '- errors: ' + String(portalSnapshot.diagnostics.errors.length),
            '- zoom: ' + String(portalSnapshot.zoom)
        ];
    };

    OFP.formatCombinedInputSummary = function formatCombinedInputSummary(adapterResult, portalSnapshot, options) {
        var drawCounts = adapterResult.metadata.counts;

        return [
            'Draw Tools adapter import succeeded.',
            'Portal Snapshot read succeeded.',
            '',
            'Seed: ' + options.seed,
            'Orion: ' + String(options.useOrionAssignment),
            'Hierarchy: ' + String(options.useHierarchyColoring),
            '',
            'Draw Tools:',
            '- rawPolygons: ' + String(adapterResult.rawPolygons.length),
            '- rawPolylines: ' + String(adapterResult.rawPolylines.length),
            '- rawMarkers: ' + String(adapterResult.rawMarkers.length),
            '- rawCircles: ' + String(adapterResult.rawCircles.length),
            '- ignoredObjects: ' + String(adapterResult.ignoredObjects.length),
            '- total layers: ' + String(drawCounts.total),
            '- adapter warnings: ' + String(adapterResult.diagnostics.warnings.length),
            '- adapter errors: ' + String(adapterResult.diagnostics.errors.length),
            ''
        ].concat(
            OFP.formatPortalSnapshotSummaryLines(portalSnapshot),
            [
                '',
                'Portal matching is not implemented yet.',
                'Core completion pipeline is not implemented yet.'
            ]
        ).join('\n');
    };

    OFP.NORMALIZATION_EPS = 1e-12;

    OFP.makeNormalizationDiagnostic = function makeNormalizationDiagnostic(level, code, message, details) {
        return {
            level: level,
            module: 'normalization',
            stage: 'normalize',
            code: code,
            message: message,
            details: details || null,
            timestamp: new Date().toISOString()
        };
    };

    OFP.pointOnSegment = function pointOnSegment(a, b, p) {
        var ax = a.lng;
        var ay = a.lat;
        var bx = b.lng;
        var by = b.lat;
        var px = p.lng;
        var py = p.lat;

        var dx = bx - ax;
        var dy = by - ay;
        var len2 = dx * dx + dy * dy;

        // A closed GeoJSON polygon may repeat the first vertex as the last vertex.
        // The resulting zero-length segment must not classify every point as on-boundary.
        if (len2 <= OFP.NORMALIZATION_EPS * OFP.NORMALIZATION_EPS) {
            return false;
        }

        var cross = dx * (py - ay) - dy * (px - ax);
        if (Math.abs(cross) > OFP.NORMALIZATION_EPS) return false;

        var dot = (px - ax) * dx + (py - ay) * dy;
        if (dot < -OFP.NORMALIZATION_EPS) return false;

        if (dot - len2 > OFP.NORMALIZATION_EPS) return false;

        return true;
    };

    OFP.pointOnRing = function pointOnRing(ring, point) {
        if (!Array.isArray(ring) || ring.length < 2) return false;

        for (var i = 0; i < ring.length; i += 1) {
            var j = (i + 1) % ring.length;
            if (OFP.pointOnSegment(ring[i], ring[j], point)) {
                return true;
            }
        }

        return false;
    };

    OFP.pointInRing = function pointInRing(ring, point) {
        if (!Array.isArray(ring) || ring.length < 3) return false;

        var inside = false;

        for (var i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
            var pi = ring[i];
            var pj = ring[j];

            var intersects =
                ((pi.lat > point.lat) !== (pj.lat > point.lat)) &&
                (
                    point.lng <
                    (pj.lng - pi.lng) * (point.lat - pi.lat) / (pj.lat - pi.lat) + pi.lng
                );

            if (intersects) inside = !inside;
        }

        return inside;
    };

    OFP.pointInSearchPolygonInclusive = function pointInSearchPolygonInclusive(point, searchPolygon) {
        if (!searchPolygon || !Array.isArray(searchPolygon.outerRing)) return false;

        if (OFP.pointOnRing(searchPolygon.outerRing, point)) {
            return true;
        }

        if (!OFP.pointInRing(searchPolygon.outerRing, point)) {
            return false;
        }

        var holes = searchPolygon.holes || [];

        for (var i = 0; i < holes.length; i += 1) {
            if (OFP.pointOnRing(holes[i], point)) {
                return false;
            }

            if (OFP.pointInRing(holes[i], point)) {
                return false;
            }
        }

        return true;
    };

    OFP.pointInAnyRawPolygon = function pointInAnyRawPolygon(point, rawPolygons) {
        for (var i = 0; i < rawPolygons.length; i += 1) {
            var rawPolygon = rawPolygons[i];
            var polygons = rawPolygon.polygons || [];

            for (var j = 0; j < polygons.length; j += 1) {
                if (OFP.pointInSearchPolygonInclusive(point, polygons[j])) {
                    return true;
                }
            }
        }

        return false;
    };

    OFP.matchLatLngToPortalIdsExact = function matchLatLngToPortalIdsExact(latLng, portalSnapshot) {
        var key = OFP.getPortalLatLngKey(latLng);
        if (!key) return [];

        return portalSnapshot.indexByLatLng[key] || [];
    };

    OFP.sortPortalPair = function sortPortalPair(portalIdA, portalIdB) {
        var a = String(portalIdA);
        var b = String(portalIdB);

        return a < b ? [a, b] : [b, a];
    };

    OFP.getCanonicalLinkId = function getCanonicalLinkId(portalIdA, portalIdB) {
        var pair = OFP.sortPortalPair(portalIdA, portalIdB);
        return pair[0] + '-' + pair[1];
    };

    OFP.makeRequiredLinkIntent = function makeRequiredLinkIntent(portalIdA, portalIdB, metadata) {
        var pair = OFP.sortPortalPair(portalIdA, portalIdB);
        var linkId = pair[0] + '-' + pair[1];

        return {
            id: linkId,
            from: pair[0],
            to: pair[1],
            kind: 'required',
            source: 'polyline',
            status: 'planned',
            metadata: metadata || {}
        };
    };

    OFP.isRequiredPortalId = function isRequiredPortalId(normalizationResult, portalId) {
        return normalizationResult.requiredPortalIds.indexOf(portalId) >= 0;
    };

    OFP.addIgnoredPolylineSegment = function addIgnoredPolylineSegment(normalizationResult, entry) {
        normalizationResult.ignoredPolylineSegments.push(entry);
        normalizationResult.metadata.counts.ignoredSegments += 1;
    };

    OFP.normalizePolylineRequiredLinks = function normalizePolylineRequiredLinks(
    adapterResult,
     portalSnapshot,
     normalizationResult
    ) {
        adapterResult.rawPolylines.forEach(function (rawPolyline) {
            var paths = rawPolyline.paths || [];

            if (!paths.length) {
                normalizationResult.diagnostics.warnings.push(OFP.makeNormalizationDiagnostic(
                    'warning',
                    'POLYLINE_PATHS_EMPTY',
                    'A polyline has no readable path and was ignored.',
                    {
                        sourceIndex: rawPolyline.sourceIndex
                    }
                ));
                return;
            }

            paths.forEach(function (path, pathIndex) {
                if (!Array.isArray(path) || path.length < 2) {
                    normalizationResult.diagnostics.warnings.push(OFP.makeNormalizationDiagnostic(
                        'warning',
                        'POLYLINE_TOO_SHORT',
                        'A polyline path has fewer than two points and was ignored.',
                        {
                            sourceIndex: rawPolyline.sourceIndex,
                            pathIndex: pathIndex
                        }
                    ));
                    return;
                }

                for (var segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
                    OFP.normalizeOnePolylineSegment(
                        path[segmentIndex],
                        path[segmentIndex + 1],
                        rawPolyline,
                        pathIndex,
                        segmentIndex,
                        portalSnapshot,
                        normalizationResult
                    );
                }
            });
        });
    };

    OFP.normalizeOnePolylineSegment = function normalizeOnePolylineSegment(
    endpointA,
     endpointB,
     rawPolyline,
     pathIndex,
     segmentIndex,
     portalSnapshot,
     normalizationResult
    ) {
        var matchedA = OFP.matchLatLngToPortalIdsExact(endpointA, portalSnapshot);
        var matchedB = OFP.matchLatLngToPortalIdsExact(endpointB, portalSnapshot);

        var baseDetails = {
            sourceIndex: rawPolyline.sourceIndex,
            pathIndex: pathIndex,
            segmentIndex: segmentIndex,
            endpointA: endpointA,
            endpointB: endpointB,
            endpointAKey: OFP.getPortalLatLngKey(endpointA),
            endpointBKey: OFP.getPortalLatLngKey(endpointB)
        };

        if (matchedA.length === 0 || matchedB.length === 0) {
            normalizationResult.metadata.counts.segmentUnmatchedEndpoints += 1;

            OFP.addIgnoredPolylineSegment(normalizationResult, {
                reason: 'unmatched_endpoint',
                details: baseDetails
            });

            normalizationResult.diagnostics.warnings.push(OFP.makeNormalizationDiagnostic(
                'warning',
                'POLYLINE_SEGMENT_ENDPOINT_UNMATCHED',
                'A polyline segment endpoint did not match any loaded portal by exact coordinate key.',
                {
                    sourceIndex: rawPolyline.sourceIndex,
                    pathIndex: pathIndex,
                    segmentIndex: segmentIndex,
                    matchedEndpointA: matchedA.length,
                    matchedEndpointB: matchedB.length,
                    endpointAKey: baseDetails.endpointAKey,
                    endpointBKey: baseDetails.endpointBKey
                }
            ));
            return;
        }

        if (matchedA.length > 1 || matchedB.length > 1) {
            normalizationResult.metadata.counts.segmentAmbiguousEndpoints += 1;

            OFP.addIgnoredPolylineSegment(normalizationResult, {
                reason: 'ambiguous_endpoint',
                details: baseDetails
            });

            normalizationResult.diagnostics.errors.push(OFP.makeNormalizationDiagnostic(
                'error',
                'POLYLINE_SEGMENT_ENDPOINT_AMBIGUOUS',
                'A polyline segment endpoint matched multiple loaded portals at the same coordinate key.',
                {
                    sourceIndex: rawPolyline.sourceIndex,
                    pathIndex: pathIndex,
                    segmentIndex: segmentIndex,
                    matchedEndpointA: matchedA,
                    matchedEndpointB: matchedB,
                    endpointAKey: baseDetails.endpointAKey,
                    endpointBKey: baseDetails.endpointBKey
                }
            ));
            return;
        }

        var portalIdA = matchedA[0];
        var portalIdB = matchedB[0];

        if (portalIdA === portalIdB) {
            normalizationResult.metadata.counts.segmentSelfLinks += 1;

            OFP.addIgnoredPolylineSegment(normalizationResult, {
                reason: 'self_link',
                details: {
                    sourceIndex: rawPolyline.sourceIndex,
                    pathIndex: pathIndex,
                    segmentIndex: segmentIndex,
                    portalId: portalIdA
                }
            });

            normalizationResult.diagnostics.warnings.push(OFP.makeNormalizationDiagnostic(
                'warning',
                'POLYLINE_SEGMENT_SELF_LINK',
                'A polyline segment has the same portal at both endpoints and was ignored.',
                {
                    sourceIndex: rawPolyline.sourceIndex,
                    pathIndex: pathIndex,
                    segmentIndex: segmentIndex,
                    portalId: portalIdA
                }
            ));
            return;
        }

        if (
            !OFP.isRequiredPortalId(normalizationResult, portalIdA) ||
            !OFP.isRequiredPortalId(normalizationResult, portalIdB)
        ) {
            normalizationResult.metadata.counts.segmentEndpointsOutsideRequiredSet += 1;

            OFP.addIgnoredPolylineSegment(normalizationResult, {
                reason: 'endpoint_outside_required_set',
                details: {
                    sourceIndex: rawPolyline.sourceIndex,
                    pathIndex: pathIndex,
                    segmentIndex: segmentIndex,
                    portalIdA: portalIdA,
                    portalIdB: portalIdB
                }
            });

            normalizationResult.diagnostics.warnings.push(OFP.makeNormalizationDiagnostic(
                'warning',
                'POLYLINE_SEGMENT_ENDPOINT_OUTSIDE_REQUIRED_SET',
                'A polyline segment endpoint is not in RequiredPortalSet, so the segment was ignored.',
                {
                    sourceIndex: rawPolyline.sourceIndex,
                    pathIndex: pathIndex,
                    segmentIndex: segmentIndex,
                    portalIdA: portalIdA,
                    portalIdB: portalIdB
                }
            ));
            return;
        }

        var linkId = OFP.getCanonicalLinkId(portalIdA, portalIdB);

        if (normalizationResult.linkMap[linkId]) {
            normalizationResult.metadata.counts.duplicateSegments += 1;

            normalizationResult.linkMap[linkId].metadata.duplicateSources.push({
                sourceIndex: rawPolyline.sourceIndex,
                pathIndex: pathIndex,
                segmentIndex: segmentIndex
            });

            return;
        }

        normalizationResult.linkMap[linkId] = OFP.makeRequiredLinkIntent(portalIdA, portalIdB, {
            sourceIndex: rawPolyline.sourceIndex,
            pathIndex: pathIndex,
            segmentIndex: segmentIndex,
            duplicateSources: []
        });

        normalizationResult.requiredLinkIds.push(linkId);
        normalizationResult.metadata.counts.requiredLinks = normalizationResult.requiredLinkIds.length;
    };

    OFP.normalizeRequiredPortalSet = function normalizeRequiredPortalSet(adapterResult, portalSnapshot) {
        var diagnostics = {
            errors: [],
            warnings: []
        };

        var result = {
            portalMap: {},
            requiredPortalIds: [],
            excludedPortalIds: [],
            candidatePortalIds: [],

            linkMap: {},
            requiredLinkIds: [],
            ignoredPolylineSegments: [],

            diagnostics: diagnostics,
            metadata: {
                timestamp: new Date().toISOString(),
                counts: {
                    rawPolygons: adapterResult.rawPolygons.length,
                    rawPolylines: adapterResult.rawPolylines.length,
                    rawMarkers: adapterResult.rawMarkers.length,
                    loadedPortals: portalSnapshot.loadedPortalIds.length,

                    candidatePortals: 0,
                    excludedPortals: 0,
                    requiredPortals: 0,

                    markerMatches: 0,
                    markerUnmatched: 0,
                    markerAmbiguous: 0,

                    requiredLinks: 0,
                    ignoredSegments: 0,
                    duplicateSegments: 0,
                    segmentUnmatchedEndpoints: 0,
                    segmentAmbiguousEndpoints: 0,
                    segmentEndpointsOutsideRequiredSet: 0,
                    segmentSelfLinks: 0
                }
            }
        };

        if (!adapterResult.rawPolygons.length) {
            diagnostics.errors.push(OFP.makeNormalizationDiagnostic(
                'error',
                'NO_POLYGON',
                'No polygon was found in Draw Tools input.',
                null
            ));

            return result;
        }

        var candidateSet = {};
        var excludedSet = {};

        portalSnapshot.loadedPortalIds.forEach(function (portalId) {
            var portalRef = portalSnapshot.portalMap[portalId];
            if (!portalRef || !portalRef.latLng) return;

            if (OFP.pointInAnyRawPolygon(portalRef.latLng, adapterResult.rawPolygons)) {
                candidateSet[portalId] = true;
            }
        });

        adapterResult.rawMarkers.forEach(function (marker) {
            if (!marker.latLng) {
                diagnostics.warnings.push(OFP.makeNormalizationDiagnostic(
                    'warning',
                    'MARKER_LATLNG_MISSING',
                    'A marker has no readable coordinate and was ignored.',
                    {
                        sourceIndex: marker.sourceIndex
                    }
                ));
                return;
            }

            var matchedPortalIds = OFP.matchLatLngToPortalIdsExact(marker.latLng, portalSnapshot);

            if (matchedPortalIds.length === 0) {
                result.metadata.counts.markerUnmatched += 1;

                diagnostics.warnings.push(OFP.makeNormalizationDiagnostic(
                    'warning',
                    'MARKER_PORTAL_UNMATCHED',
                    'A marker did not match any loaded portal by exact coordinate key.',
                    {
                        sourceIndex: marker.sourceIndex,
                        latLng: marker.latLng,
                        latLngKey: OFP.getPortalLatLngKey(marker.latLng)
                    }
                ));
                return;
            }

            if (matchedPortalIds.length > 1) {
                result.metadata.counts.markerAmbiguous += 1;

                diagnostics.errors.push(OFP.makeNormalizationDiagnostic(
                    'error',
                    'MARKER_PORTAL_AMBIGUOUS',
                    'A marker matched multiple loaded portals at the same coordinate key.',
                    {
                        sourceIndex: marker.sourceIndex,
                        latLng: marker.latLng,
                        latLngKey: OFP.getPortalLatLngKey(marker.latLng),
                        matchedPortalIds: matchedPortalIds
                    }
                ));
                return;
            }

            result.metadata.counts.markerMatches += 1;

            var matchedPortalId = matchedPortalIds[0];

            if (!candidateSet[matchedPortalId]) {
                diagnostics.warnings.push(OFP.makeNormalizationDiagnostic(
                    'warning',
                    'MARKER_OUTSIDE_REQUIRED_CANDIDATES',
                    'A marker matched a portal outside polygon-selected candidates and had no exclusion effect.',
                    {
                        sourceIndex: marker.sourceIndex,
                        portalId: matchedPortalId
                    }
                ));
                return;
            }

            excludedSet[matchedPortalId] = true;
        });

        Object.keys(candidateSet).sort().forEach(function (portalId) {
            result.candidatePortalIds.push(portalId);

            if (excludedSet[portalId]) {
                result.excludedPortalIds.push(portalId);
                return;
            }

            result.requiredPortalIds.push(portalId);
            result.portalMap[portalId] = portalSnapshot.portalMap[portalId];
        });

        result.metadata.counts.candidatePortals = result.candidatePortalIds.length;
        result.metadata.counts.excludedPortals = result.excludedPortalIds.length;
        result.metadata.counts.requiredPortals = result.requiredPortalIds.length;

        if (result.requiredPortalIds.length === 0) {
            diagnostics.errors.push(OFP.makeNormalizationDiagnostic(
                'error',
                'REQUIRED_PORTAL_SET_EMPTY',
                'RequiredPortalSet is empty after polygon selection and marker exclusion.',
                {
                    candidatePortals: result.candidatePortalIds.length,
                    excludedPortals: result.excludedPortalIds.length
                }
            ));
        } else {
            OFP.normalizePolylineRequiredLinks(adapterResult, portalSnapshot, result);
        }

        result.requiredLinkIds.sort();
        result.metadata.counts.requiredLinks = result.requiredLinkIds.length;

        return result;
    };

    OFP.formatNormalizationSummaryLines = function formatNormalizationSummaryLines(normalizationResult) {
        var counts = normalizationResult.metadata.counts;

        return [
            'Normalization:',
            '- candidate portals: ' + String(counts.candidatePortals),
            '- excluded portals: ' + String(counts.excludedPortals),
            '- required portals: ' + String(counts.requiredPortals),
            '- marker matches: ' + String(counts.markerMatches),
            '- marker unmatched: ' + String(counts.markerUnmatched),
            '- marker ambiguous: ' + String(counts.markerAmbiguous),
            '',
            'Required links:',
            '- required links: ' + String(counts.requiredLinks),
            '- ignored segments: ' + String(counts.ignoredSegments),
            '- duplicate segments: ' + String(counts.duplicateSegments),
            '- segment unmatched endpoints: ' + String(counts.segmentUnmatchedEndpoints),
            '- segment ambiguous endpoints: ' + String(counts.segmentAmbiguousEndpoints),
            '- segment endpoints outside RequiredPortalSet: ' + String(counts.segmentEndpointsOutsideRequiredSet),
            '- segment self-links: ' + String(counts.segmentSelfLinks),
            '',
            'Diagnostics:',
            '- errors: ' + String(normalizationResult.diagnostics.errors.length),
            '- warnings: ' + String(normalizationResult.diagnostics.warnings.length)
        ];
    };

    OFP.debugRequiredLinks = function debugRequiredLinks() {
        var result = OFP.lastNormalizationResult;
        if (!result) return [];

        return result.requiredLinkIds.map(function (linkId) {
            var link = result.linkMap[linkId];

            return {
                id: link.id,
                from: link.from,
                to: link.to,
                duplicateSources: link.metadata.duplicateSources.length
            };
        });
    };

    OFP.formatCombinedNormalizationSummary = function formatCombinedNormalizationSummary(
    adapterResult,
     portalSnapshot,
     normalizationResult,
     options
    ) {
        var drawCounts = adapterResult.metadata.counts;

        return [
            'Draw Tools adapter import succeeded.',
            'Portal Snapshot read succeeded.',
            'Normalization completed.',
            '',
            'Seed: ' + options.seed,
            'Orion: ' + String(options.useOrionAssignment),
            'Hierarchy: ' + String(options.useHierarchyColoring),
            '',
            'Draw Tools:',
            '- rawPolygons: ' + String(adapterResult.rawPolygons.length),
            '- rawPolylines: ' + String(adapterResult.rawPolylines.length),
            '- rawMarkers: ' + String(adapterResult.rawMarkers.length),
            '- rawCircles: ' + String(adapterResult.rawCircles.length),
            '- ignoredObjects: ' + String(adapterResult.ignoredObjects.length),
            '- total layers: ' + String(drawCounts.total),
            ''
        ].concat(
            OFP.formatPortalSnapshotSummaryLines(portalSnapshot),
            [''],
            OFP.formatNormalizationSummaryLines(normalizationResult),
            [
                '',
                'Core completion pipeline is not implemented yet.'
            ]
        ).join('\n');
    };

    OFP.makePlanDiagnostic = function makePlanDiagnostic(level, code, message, details) {
        return {
            level: level,
            module: 'plan_builder',
            stage: 'build_plan',
            code: code,
            message: message,
            details: details || null,
            timestamp: new Date().toISOString()
        };
    };

    OFP.hullOrientation = function hullOrientation(a, b, c) {
        var ax = a.latLng.lng;
        var ay = a.latLng.lat;
        var bx = b.latLng.lng;
        var by = b.latLng.lat;
        var cx = c.latLng.lng;
        var cy = c.latLng.lat;

        return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    };

    OFP.computeConvexHullPortalIds = function computeConvexHullPortalIds(portalRefs) {
        if (!Array.isArray(portalRefs) || portalRefs.length < 3) return [];

        var points = portalRefs.slice().sort(function (a, b) {
            if (a.latLng.lng !== b.latLng.lng) return a.latLng.lng - b.latLng.lng;
            if (a.latLng.lat !== b.latLng.lat) return a.latLng.lat - b.latLng.lat;
            return String(a.id).localeCompare(String(b.id));
        });

        var lower = [];
        points.forEach(function (point) {
            while (
                lower.length >= 2 &&
                OFP.hullOrientation(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
            ) {
                lower.pop();
            }

            lower.push(point);
        });

        var upper = [];
        for (var i = points.length - 1; i >= 0; i -= 1) {
            var point = points[i];

            while (
                upper.length >= 2 &&
                OFP.hullOrientation(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
            ) {
                upper.pop();
            }

            upper.push(point);
        }

        var hull = lower.slice(0, -1).concat(upper.slice(0, -1));

        return hull.map(function (portalRef) {
            return portalRef.id;
        });
    };

    OFP.hasDuplicateRequiredCoordinates = function hasDuplicateRequiredCoordinates(normalizationResult) {
        var seen = {};
        var duplicates = [];

        normalizationResult.requiredPortalIds.forEach(function (portalId) {
            var portalRef = normalizationResult.portalMap[portalId];
            if (!portalRef || !portalRef.latLng) return;

            var key = OFP.getPortalLatLngKey(portalRef.latLng);

            if (!seen[key]) {
                seen[key] = [];
            }

            seen[key].push(portalId);
        });

        Object.keys(seen).forEach(function (key) {
            if (seen[key].length > 1) {
                duplicates.push({
                    latLngKey: key,
                    portalIds: seen[key]
                });
            }
        });

        return duplicates;
    };

    OFP.makeWorkingPoint = function makeWorkingPoint(portalRef) {
        return {
            id: portalRef.id,
            portalId: portalRef.id,
            latLng: {
                lat: portalRef.latLng.lat,
                lng: portalRef.latLng.lng
            },
            label: portalRef.label || null,
            metadata: portalRef.metadata || {}
        };
    };

    OFP.buildWorkingCompletionView = function buildWorkingCompletionView(plan, hullPortalIds) {
        var hullSet = {};
        hullPortalIds.forEach(function (portalId) {
            hullSet[portalId] = true;
        });

        var innerPortalIds = plan.requiredPortalIds
        .filter(function (portalId) {
            return !hullSet[portalId];
        })
        .sort();

        var orderedPortalIds = hullPortalIds.concat(innerPortalIds);

        var workingView = {
            points: [],
            hull: [],
            inner: [],
            indexByPortalId: {},
            portalIdByIndex: [],
            requiredEdges: []
        };

        orderedPortalIds.forEach(function (portalId, index) {
            var portalRef = plan.portalMap[portalId];

            workingView.points.push(OFP.makeWorkingPoint(portalRef));
            workingView.indexByPortalId[portalId] = index;
            workingView.portalIdByIndex[index] = portalId;

            if (hullSet[portalId]) {
                workingView.hull.push(index);
            } else {
                workingView.inner.push(index);
            }
        });

        plan.requiredLinkIds.forEach(function (linkId) {
            var link = plan.linkMap[linkId];
            if (!link) return;

            workingView.requiredEdges.push({
                id: link.id,
                from: link.from,
                to: link.to,
                fromIndex: workingView.indexByPortalId[link.from],
                toIndex: workingView.indexByPortalId[link.to]
            });
        });

        return workingView;
    };

    OFP.buildPlanFromNormalization = function buildPlanFromNormalization(normalizationResult) {
        var diagnostics = {
            errors: [],
            warnings: []
        };

        var plan = {
            portalMap: {},
            requiredPortalIds: normalizationResult.requiredPortalIds.slice().sort(),
            requiredLinkIds: normalizationResult.requiredLinkIds.slice().sort(),
            linkMap: {},

            fieldMap: {},
            completionStructure: null,
            dependencyGraph: null,

            workingView: {
                points: [],
                hull: [],
                inner: [],
                indexByPortalId: {},
                portalIdByIndex: [],
                requiredEdges: []
            },

            diagnostics: diagnostics,
            metadata: {
                timestamp: new Date().toISOString(),
                counts: {
                    portals: 0,
                    requiredLinks: 0,
                    hullPortals: 0,
                    innerPortals: 0
                }
            }
        };

        Object.keys(normalizationResult.portalMap).forEach(function (portalId) {
            plan.portalMap[portalId] = normalizationResult.portalMap[portalId];
        });

        Object.keys(normalizationResult.linkMap).forEach(function (linkId) {
            plan.linkMap[linkId] = normalizationResult.linkMap[linkId];
        });

        if (normalizationResult.diagnostics.errors.length > 0) {
            diagnostics.errors.push(OFP.makePlanDiagnostic(
                'error',
                'NORMALIZATION_HAS_ERRORS',
                'Plan was not built because normalization has errors.',
                {
                    normalizationErrors: normalizationResult.diagnostics.errors.length
                }
            ));

            return plan;
        }

        plan.metadata.counts.portals = plan.requiredPortalIds.length;
        plan.metadata.counts.requiredLinks = plan.requiredLinkIds.length;

        if (plan.requiredPortalIds.length < 3) {
            diagnostics.errors.push(OFP.makePlanDiagnostic(
                'error',
                'REQUIRED_PORTALS_TOO_FEW',
                'At least three required portals are needed to build a non-degenerate plan.',
                {
                    requiredPortals: plan.requiredPortalIds.length
                }
            ));

            return plan;
        }

        var duplicateCoordinates = OFP.hasDuplicateRequiredCoordinates(normalizationResult);

        if (duplicateCoordinates.length > 0) {
            diagnostics.errors.push(OFP.makePlanDiagnostic(
                'error',
                'DUPLICATE_REQUIRED_PORTAL_COORDINATES',
                'Some required portals share the same coordinate key.',
                {
                    duplicateCoordinates: duplicateCoordinates
                }
            ));

            return plan;
        }

        var portalRefs = plan.requiredPortalIds.map(function (portalId) {
            return plan.portalMap[portalId];
        });

        var hullPortalIds = OFP.computeConvexHullPortalIds(portalRefs);

        if (hullPortalIds.length < 3) {
            diagnostics.errors.push(OFP.makePlanDiagnostic(
                'error',
                'REQUIRED_PORTALS_DEGENERATE_HULL',
                'Required portals do not form a non-degenerate hull.',
                {
                    requiredPortals: plan.requiredPortalIds.length,
                    hullPortals: hullPortalIds.length
                }
            ));

            return plan;
        }

        plan.workingView = OFP.buildWorkingCompletionView(plan, hullPortalIds);

        plan.metadata.counts.hullPortals = plan.workingView.hull.length;
        plan.metadata.counts.innerPortals = plan.workingView.inner.length;

        plan.requiredLinkIds.forEach(function (linkId) {
            var link = plan.linkMap[linkId];

            if (!link) {
                diagnostics.errors.push(OFP.makePlanDiagnostic(
                    'error',
                    'REQUIRED_LINK_MISSING',
                    'A required link id is missing from linkMap.',
                    {
                        linkId: linkId
                    }
                ));
                return;
            }

            if (typeof plan.workingView.indexByPortalId[link.from] !== 'number' ||
                typeof plan.workingView.indexByPortalId[link.to] !== 'number') {
                diagnostics.errors.push(OFP.makePlanDiagnostic(
                    'error',
                    'REQUIRED_LINK_ENDPOINT_MISSING',
                    'A required link endpoint is missing from the working view.',
                    {
                        linkId: linkId,
                        from: link.from,
                        to: link.to
                    }
                ));
            }
        });

        return plan;
    };

    OFP.formatPlanSummaryLines = function formatPlanSummaryLines(plan) {
        var counts = plan.metadata.counts;

        return [
            'Plan:',
            '- portals: ' + String(counts.portals),
            '- required links: ' + String(counts.requiredLinks),
            '- hull portals: ' + String(counts.hullPortals),
            '- inner portals: ' + String(counts.innerPortals),
            '- working points: ' + String(plan.workingView.points.length),
            '- required edges: ' + String(plan.workingView.requiredEdges.length),
            '- plan errors: ' + String(plan.diagnostics.errors.length),
            '- plan warnings: ' + String(plan.diagnostics.warnings.length)
        ];
    };

    OFP.countDiagnostics = function countDiagnostics(items) {
        var errors = 0;
        var warnings = 0;

        (items || []).forEach(function (entry) {
            if (!entry) return;

            if (Array.isArray(entry.errors)) {
                errors += entry.errors.length;
            }

            if (Array.isArray(entry.warnings)) {
                warnings += entry.warnings.length;
            }

            if (entry.diagnostics) {
                if (Array.isArray(entry.diagnostics.errors)) {
                    errors += entry.diagnostics.errors.length;
                }

                if (Array.isArray(entry.diagnostics.warnings)) {
                    warnings += entry.diagnostics.warnings.length;
                }
            }
        });

        return {
            errors: errors,
            warnings: warnings
        };
    };

    OFP.getCompactColoringModeLabel = function getCompactColoringModeLabel(options, orionAssignmentResult) {
        if (options.useOrionAssignment) {
            if (orionAssignmentResult && orionAssignmentResult.success) {
                return 'Orion owner coloring ready';
            }

            return 'Orion requested, assignment not ready';
        }

        if (options.useHierarchyColoring) {
            return 'Hierarchy coloring ready';
        }

        return 'Default coloring';
    };

    OFP.getCompactCompletionStatusLabel = function getCompactCompletionStatusLabel(
    completionResult,
     planValidationReport,
     orionAssignmentResult,
     options
    ) {
        if (!completionResult || !completionResult.success) {
            return 'FAILED';
        }

        if (!planValidationReport || !planValidationReport.isValid) {
            return 'INVALID';
        }

        if (options.useOrionAssignment &&
            (!orionAssignmentResult || !orionAssignmentResult.success)) {
            return 'ORION FAILED';
        }

        return 'READY';
    };

    OFP.collectCompactErrorMessages = function collectCompactErrorMessages(
    normalizationResult,
     plan,
     requiredLinkGeometryReport,
     completionResult,
     planValidationReport,
     orionAssignmentResult
    ) {
        var errors = [];

        function pushErrors(sourceName, list) {
            (list || []).forEach(function (entry) {
                errors.push({
                    source: sourceName,
                    code: entry.code || 'ERROR',
                    message: entry.message || String(entry)
                });
            });
        }

        pushErrors('normalization', normalizationResult && normalizationResult.diagnostics
                   ? normalizationResult.diagnostics.errors
                   : []);

        pushErrors('plan', plan ? plan.diagnostics.errors : []);
        pushErrors('required link geometry', requiredLinkGeometryReport ? requiredLinkGeometryReport.errors : []);
        pushErrors('completion', completionResult ? completionResult.errors : []);
        pushErrors('plan validation', planValidationReport ? planValidationReport.errors : []);

        pushErrors('orion assignment', orionAssignmentResult && orionAssignmentResult.diagnostics
                   ? orionAssignmentResult.diagnostics.errors
                   : []);

        return errors;
    };

    OFP.formatCompactErrorLines = function formatCompactErrorLines(errors) {
        if (!errors || !errors.length) {
            return [];
        }

        var lines = [
            '',
            'Errors:',
        ];

        errors.slice(0, 5).forEach(function (entry) {
            lines.push('- [' + entry.source + '] ' + entry.message);
        });

        if (errors.length > 5) {
            lines.push('- ... ' + String(errors.length - 5) + ' more errors. See console debug functions.');
        }

        return lines;
    };

    OFP.formatCompactCompletePlanSummary = function formatCompactCompletePlanSummary(
    adapterResult,
     portalSnapshot,
     normalizationResult,
     plan,
     requiredLinkGeometryReport,
     completionResult,
     planValidationReport,
     orionAssignmentResult,
     options
    ) {
        var drawCounts = adapterResult.metadata.counts;
        var normalizationCounts = normalizationResult.metadata.counts;
        var planCounts = plan.metadata.counts;
        var completionStats = completionResult.stats || {};
        var diagnostics = OFP.countDiagnostics([
            adapterResult,
            portalSnapshot,
            normalizationResult,
            plan,
            requiredLinkGeometryReport,
            completionResult,
            planValidationReport,
            orionAssignmentResult
        ]);

        var status = OFP.getCompactCompletionStatusLabel(
            completionResult,
            planValidationReport,
            orionAssignmentResult,
            options
        );

        var lines = [
            'Complete plan: ' + status,
            '',
            'Input:',
            '- draw items: ' + String(drawCounts.total) +
            ' = ' +
            String(drawCounts.polygons) + ' polygons, ' +
            String(drawCounts.polylines) + ' polylines, ' +
            String(drawCounts.markers) + ' markers, ' +
            String(drawCounts.circles) + ' circles',
            '- loaded portals: ' + String(portalSnapshot.metadata.counts.portals),
            '- required portals: ' + String(normalizationCounts.requiredPortals) +
            ' = ' +
            String(planCounts.hullPortals) + ' hull, ' +
            String(planCounts.innerPortals) + ' inner',
            '- required links: ' + String(normalizationCounts.requiredLinks),
            '',
            'Output:',
            '- completed links: ' + String(completionStats.completedLinks || 0),
            '- completed fields: ' + String(completionStats.completedFields || 0),
            '- attempts: ' + String(completionStats.attempts || 0),
            '- max depth: ' + String(completionStats.maxDepth || 0),
            '- coloring: ' + OFP.getCompactColoringModeLabel(options, orionAssignmentResult),
            '',
            'Checks:',
            '- required-link geometry: ' + String(requiredLinkGeometryReport.isValid),
            '- plan validation: ' + String(planValidationReport.isValid),
            '- errors: ' + String(diagnostics.errors),
            '- warnings: ' + String(diagnostics.warnings),
            '',
            'Next:',
            completionResult.success && planValidationReport.isValid
            ? '- Use Export plan to write the result to Draw Tools.'
            : '- Fix the input or change the seed, then run Complete plan again.',
            '- Complete plan did not modify Draw Tools.'
        ];

        return lines.concat(
            OFP.formatCompactErrorLines(
                OFP.collectCompactErrorMessages(
                    normalizationResult,
                    plan,
                    requiredLinkGeometryReport,
                    completionResult,
                    planValidationReport,
                    orionAssignmentResult
                )
            )
        ).join('\n');
    };

    OFP.formatCombinedPlanSummary = function formatCombinedPlanSummary(
    adapterResult,
     portalSnapshot,
     normalizationResult,
     plan,
     requiredLinkGeometryReport,
     completionResult,
     planValidationReport,
     orionAssignmentResult,
     options
    ) {
        return OFP.formatCompactCompletePlanSummary(
            adapterResult,
            portalSnapshot,
            normalizationResult,
            plan,
            requiredLinkGeometryReport,
            completionResult,
            planValidationReport,
            orionAssignmentResult,
            options
        );
    };

    OFP.debugWorkingView = function debugWorkingView() {
        var plan = OFP.lastPlan;
        if (!plan) return null;

        return {
            points: plan.workingView.points.map(function (point, index) {
                return {
                    index: index,
                    portalId: point.portalId,
                    label: point.label,
                    latLng: point.latLng
                };
            }),
            hull: plan.workingView.hull,
            inner: plan.workingView.inner,
            requiredEdges: plan.workingView.requiredEdges
        };
    };

    OFP.debugCompletedLinkColors = function debugCompletedLinkColors() {
        var plan = OFP.lastPlan;
        if (!plan || !plan.completionStructure) return [];

        return plan.completionStructure.completedLinkIds.map(function (linkId) {
            var link = plan.linkMap[linkId];
            var orionOwner = null;

            if (link && link.metadata && link.metadata.orionOwner) {
                orionOwner = link.metadata.orionOwner;
            } else if (
                plan.orionAssignment &&
                plan.orionAssignment.linkOwnerMap &&
                plan.orionAssignment.linkOwnerMap[linkId]
            ) {
                orionOwner = plan.orionAssignment.linkOwnerMap[linkId];
            }

            return {
                linkId: linkId,
                role: link && link.metadata ? link.metadata.completionRole : null,
                hierarchyLevel: link && link.metadata ? link.metadata.hierarchyLevel : null,
                orionOwner: orionOwner,
                hierarchyColor: OFP.getExportColorForLink(plan, linkId, {
                    useHierarchyColoring: true
                }),
                orionColor: OFP.getExportColorForLink(plan, linkId, {
                    useOrionAssignment: true
                }),
                defaultColor: OFP.getExportColorForLink(plan, linkId, {
                    useHierarchyColoring: false,
                    useOrionAssignment: false
                })
            };
        });
    };

    OFP.REQUIRED_LINK_GEOMETRY_EPS = 1e-12;

    OFP.makeRequiredLinkGeometryDiagnostic = function makeRequiredLinkGeometryDiagnostic(
    level,
     code,
     message,
     details
    ) {
        return {
            level: level,
            module: 'required_link_geometry',
            stage: 'validate_required_links',
            code: code,
            message: message,
            details: details || null,
            timestamp: new Date().toISOString()
        };
    };

    OFP.getWorkingPointByPortalId = function getWorkingPointByPortalId(plan, portalId) {
        var index = plan.workingView.indexByPortalId[portalId];

        if (typeof index !== 'number') {
            return null;
        }

        return plan.workingView.points[index] || null;
    };

    OFP.geometryPointFromPortalId = function geometryPointFromPortalId(plan, portalId) {
        var point = OFP.getWorkingPointByPortalId(plan, portalId);

        if (!point || !point.latLng) {
            return null;
        }

        return {
            portalId: portalId,
            lat: Number(point.latLng.lat),
            lng: Number(point.latLng.lng)
        };
    };

    OFP.geometryOrient = function geometryOrient(a, b, c) {
        return (b.lng - a.lng) * (c.lat - a.lat) -
            (b.lat - a.lat) * (c.lng - a.lng);
    };

    OFP.geometrySign = function geometrySign(value) {
        if (value > OFP.REQUIRED_LINK_GEOMETRY_EPS) return 1;
        if (value < -OFP.REQUIRED_LINK_GEOMETRY_EPS) return -1;
        return 0;
    };

    OFP.geometryPointOnSegment = function geometryPointOnSegment(a, b, p) {
        var dx = b.lng - a.lng;
        var dy = b.lat - a.lat;
        var len2 = dx * dx + dy * dy;

        if (len2 <= OFP.REQUIRED_LINK_GEOMETRY_EPS * OFP.REQUIRED_LINK_GEOMETRY_EPS) {
            return false;
        }

        var cross = dx * (p.lat - a.lat) - dy * (p.lng - a.lng);
        if (Math.abs(cross) > OFP.REQUIRED_LINK_GEOMETRY_EPS) return false;

        var dot = (p.lng - a.lng) * dx + (p.lat - a.lat) * dy;
        if (dot < -OFP.REQUIRED_LINK_GEOMETRY_EPS) return false;

        if (dot - len2 > OFP.REQUIRED_LINK_GEOMETRY_EPS) return false;

        return true;
    };

    OFP.requiredLinksSharePortal = function requiredLinksSharePortal(linkA, linkB) {
        return linkA.from === linkB.from ||
            linkA.from === linkB.to ||
            linkA.to === linkB.from ||
            linkA.to === linkB.to;
    };

    OFP.classifyRequiredLinkPairGeometry = function classifyRequiredLinkPairGeometry(plan, linkA, linkB) {
        if (OFP.requiredLinksSharePortal(linkA, linkB)) {
            return {
                relation: 'shared_endpoint',
                isError: false
            };
        }

        var a = OFP.geometryPointFromPortalId(plan, linkA.from);
        var b = OFP.geometryPointFromPortalId(plan, linkA.to);
        var c = OFP.geometryPointFromPortalId(plan, linkB.from);
        var d = OFP.geometryPointFromPortalId(plan, linkB.to);

        if (!a || !b || !c || !d) {
            return {
                relation: 'missing_endpoint',
                isError: true
            };
        }

        var o1 = OFP.geometrySign(OFP.geometryOrient(a, b, c));
        var o2 = OFP.geometrySign(OFP.geometryOrient(a, b, d));
        var o3 = OFP.geometrySign(OFP.geometryOrient(c, d, a));
        var o4 = OFP.geometrySign(OFP.geometryOrient(c, d, b));

        if (o1 * o2 < 0 && o3 * o4 < 0) {
            return {
                relation: 'proper_crossing',
                isError: true
            };
        }

        if (o1 === 0 && OFP.geometryPointOnSegment(a, b, c)) {
            return {
                relation: 'endpoint_touch',
                isError: true
            };
        }

        if (o2 === 0 && OFP.geometryPointOnSegment(a, b, d)) {
            return {
                relation: 'endpoint_touch',
                isError: true
            };
        }

        if (o3 === 0 && OFP.geometryPointOnSegment(c, d, a)) {
            return {
                relation: 'endpoint_touch',
                isError: true
            };
        }

        if (o4 === 0 && OFP.geometryPointOnSegment(c, d, b)) {
            return {
                relation: 'endpoint_touch',
                isError: true
            };
        }

        return {
            relation: 'disjoint',
            isError: false
        };
    };

    OFP.validateRequiredLinkGeometry = function validateRequiredLinkGeometry(plan) {
        var report = {
            isValid: true,
            errors: [],
            warnings: [],
            stats: {
                requiredLinks: plan.requiredLinkIds.length,
                checkedPairs: 0,
                skippedSharedEndpointPairs: 0,
                properCrossings: 0,
                endpointTouches: 0,
                missingEndpointPairs: 0
            },
            metadata: {
                timestamp: new Date().toISOString()
            }
        };

        if (plan.diagnostics.errors.length > 0) {
            report.isValid = false;
            report.errors.push(OFP.makeRequiredLinkGeometryDiagnostic(
                'error',
                'PLAN_HAS_ERRORS',
                'Required link geometry validation was skipped because the Plan has errors.',
                {
                    planErrors: plan.diagnostics.errors.length
                }
            ));

            return report;
        }

        for (var i = 0; i < plan.requiredLinkIds.length; i += 1) {
            var linkIdA = plan.requiredLinkIds[i];
            var linkA = plan.linkMap[linkIdA];

            if (!linkA) {
                report.isValid = false;
                report.errors.push(OFP.makeRequiredLinkGeometryDiagnostic(
                    'error',
                    'REQUIRED_LINK_MISSING',
                    'A required link id is missing from linkMap.',
                    {
                        linkId: linkIdA
                    }
                ));
                continue;
            }

            for (var j = i + 1; j < plan.requiredLinkIds.length; j += 1) {
                var linkIdB = plan.requiredLinkIds[j];
                var linkB = plan.linkMap[linkIdB];

                if (!linkB) {
                    report.isValid = false;
                    report.errors.push(OFP.makeRequiredLinkGeometryDiagnostic(
                        'error',
                        'REQUIRED_LINK_MISSING',
                        'A required link id is missing from linkMap.',
                        {
                            linkId: linkIdB
                        }
                    ));
                    continue;
                }

                var relation = OFP.classifyRequiredLinkPairGeometry(plan, linkA, linkB);

                if (relation.relation === 'shared_endpoint') {
                    report.stats.skippedSharedEndpointPairs += 1;
                    continue;
                }

                report.stats.checkedPairs += 1;

                if (relation.relation === 'proper_crossing') {
                    report.stats.properCrossings += 1;
                    report.isValid = false;

                    report.errors.push(OFP.makeRequiredLinkGeometryDiagnostic(
                        'error',
                        'REQUIRED_LINKS_PROPER_CROSSING',
                        'Two required links have a proper crossing.',
                        {
                            linkIdA: linkIdA,
                            linkIdB: linkIdB,
                            fromA: linkA.from,
                            toA: linkA.to,
                            fromB: linkB.from,
                            toB: linkB.to
                        }
                    ));
                } else if (relation.relation === 'endpoint_touch') {
                    report.stats.endpointTouches += 1;
                    report.isValid = false;

                    report.errors.push(OFP.makeRequiredLinkGeometryDiagnostic(
                        'error',
                        'REQUIRED_LINKS_ENDPOINT_TOUCH',
                        'Two required links touch at a non-shared endpoint or overlap geometrically.',
                        {
                            linkIdA: linkIdA,
                            linkIdB: linkIdB,
                            fromA: linkA.from,
                            toA: linkA.to,
                            fromB: linkB.from,
                            toB: linkB.to
                        }
                    ));
                } else if (relation.relation === 'missing_endpoint') {
                    report.stats.missingEndpointPairs += 1;
                    report.isValid = false;

                    report.errors.push(OFP.makeRequiredLinkGeometryDiagnostic(
                        'error',
                        'REQUIRED_LINK_ENDPOINT_MISSING',
                        'A required link endpoint could not be found in workingView.',
                        {
                            linkIdA: linkIdA,
                            linkIdB: linkIdB
                        }
                    ));
                }
            }
        }

        return report;
    };

    OFP.formatRequiredLinkGeometrySummaryLines = function formatRequiredLinkGeometrySummaryLines(report) {
        return [
            'Required link geometry:',
            '- is valid: ' + String(report.isValid),
            '- required links: ' + String(report.stats.requiredLinks),
            '- checked pairs: ' + String(report.stats.checkedPairs),
            '- shared-endpoint pairs skipped: ' + String(report.stats.skippedSharedEndpointPairs),
            '- proper crossings: ' + String(report.stats.properCrossings),
            '- endpoint touches / overlaps: ' + String(report.stats.endpointTouches),
            '- missing endpoint pairs: ' + String(report.stats.missingEndpointPairs),
            '- errors: ' + String(report.errors.length),
            '- warnings: ' + String(report.warnings.length)
        ];
    };

    OFP.debugRequiredLinkGeometry = function debugRequiredLinkGeometry() {
        var report = OFP.lastRequiredLinkGeometryReport;
        if (!report) return null;

        return report;
    };

    OFP.makeCompletionDiagnostic = function makeCompletionDiagnostic(level, code, message, details) {
        return {
            level: level,
            module: 'completion',
            stage: 'complete',
            code: code,
            message: message,
            details: details || null,
            timestamp: new Date().toISOString()
        };
    };

    OFP.getWorkingPortalId = function getWorkingPortalId(plan, pointIndex) {
        return plan.workingView.portalIdByIndex[pointIndex];
    };

    OFP.getLinkIdByPointIndex = function getLinkIdByPointIndex(plan, indexA, indexB) {
        var portalIdA = OFP.getWorkingPortalId(plan, indexA);
        var portalIdB = OFP.getWorkingPortalId(plan, indexB);

        return OFP.getCanonicalLinkId(portalIdA, portalIdB);
    };

    OFP.ensurePlanLinkIntent = function ensurePlanLinkIntent(plan, portalIdA, portalIdB, source, metadata) {
        var linkId = OFP.getCanonicalLinkId(portalIdA, portalIdB);

        if (plan.linkMap[linkId]) {
            if (!plan.linkMap[linkId].metadata) {
                plan.linkMap[linkId].metadata = {};
            }

            if (metadata && typeof metadata.hierarchyLevel === 'number' &&
                typeof plan.linkMap[linkId].metadata.hierarchyLevel !== 'number') {
                plan.linkMap[linkId].metadata.hierarchyLevel = metadata.hierarchyLevel;
            }

            if (metadata && metadata.role && !plan.linkMap[linkId].metadata.completionRole) {
                plan.linkMap[linkId].metadata.completionRole = metadata.role;
            }

            if (!plan.linkMap[linkId].metadata.completionSources) {
                plan.linkMap[linkId].metadata.completionSources = [];
            }

            plan.linkMap[linkId].metadata.completionSources.push({
                source: source,
                metadata: metadata || {}
            });

            return linkId;
        }

        var pair = OFP.sortPortalPair(portalIdA, portalIdB);

        plan.linkMap[linkId] = {
            id: linkId,
            from: pair[0],
            to: pair[1],
            kind: 'completion',
            source: source,
            status: 'planned',
            metadata: metadata || {}
        };

        return linkId;
    };

    OFP.getFieldId = function getFieldId(portalIds) {
        return 'field:' + portalIds.slice().sort().join('-');
    };

    OFP.ensurePlanFieldIntent = function ensurePlanFieldIntent(plan, portalIds, parentFieldId, metadata) {
        var fieldId = OFP.getFieldId(portalIds);

        if (plan.fieldMap[fieldId]) {
            return fieldId;
        }

        plan.fieldMap[fieldId] = {
            id: fieldId,
            vertices: portalIds.slice(),
            parentFieldId: parentFieldId || null,
            childFieldIds: [],
            status: 'planned',
            metadata: metadata || {}
        };

        return fieldId;
    };

    OFP.getFanTriangulationForHull = function getFanTriangulationForHull(plan) {
        var hull = plan.workingView.hull.slice();
        var triangles = [];
        var diagonalLinkIds = [];

        if (hull.length < 3) {
            return {
                triangles: triangles,
                diagonalLinkIds: diagonalLinkIds
            };
        }

        for (var i = 1; i < hull.length - 1; i += 1) {
            triangles.push([hull[0], hull[i], hull[i + 1]]);
        }

        for (var j = 2; j < hull.length - 1; j += 1) {
            diagonalLinkIds.push(OFP.getLinkIdByPointIndex(plan, hull[0], hull[j]));
        }

        return {
            triangles: triangles,
            diagonalLinkIds: diagonalLinkIds
        };
    };

    OFP.getHullEdgeLinkIds = function getHullEdgeLinkIds(plan) {
        var hull = plan.workingView.hull;
        var linkIds = [];

        for (var i = 0; i < hull.length; i += 1) {
            var a = hull[i];
            var b = hull[(i + 1) % hull.length];

            linkIds.push(OFP.getLinkIdByPointIndex(plan, a, b));
        }

        return linkIds;
    };

    OFP.getFanTriangulationLinkSet = function getFanTriangulationLinkSet(plan, fan) {
        var set = {};

        OFP.getHullEdgeLinkIds(plan).forEach(function (linkId) {
            set[linkId] = true;
        });

        fan.diagonalLinkIds.forEach(function (linkId) {
            set[linkId] = true;
        });

        return set;
    };

    OFP.findRequiredLinksOutsideFanTriangulation = function findRequiredLinksOutsideFanTriangulation(plan, fan) {
        var fanLinkSet = OFP.getFanTriangulationLinkSet(plan, fan);

        return plan.requiredLinkIds.filter(function (linkId) {
            return !fanLinkSet[linkId];
        });
    };

    OFP.completePlanV0 = function completePlanV0(plan, options, requiredLinkGeometryReport) {
        var result = {
            success: false,
            errors: [],
            warnings: [],
            stats: {
                hullPortals: plan.workingView.hull.length,
                innerPortals: plan.workingView.inner.length,
                hullEdges: 0,
                diagonals: 0,
                completedLinks: 0,
                completedFields: 0,
                requiredLinksOutsideFan: 0
            },
            metadata: {
                timestamp: new Date().toISOString(),
                seed: options.seed,
                mode: 'fan_no_inner_v0'
            }
        };

        if (plan.diagnostics.errors.length > 0) {
            result.errors.push(OFP.makeCompletionDiagnostic(
                'error',
                'PLAN_HAS_ERRORS',
                'Completion was skipped because the Plan has errors.',
                {
                    planErrors: plan.diagnostics.errors.length
                }
            ));
            return result;
        }

        if (!requiredLinkGeometryReport || !requiredLinkGeometryReport.isValid) {
            result.errors.push(OFP.makeCompletionDiagnostic(
                'error',
                'REQUIRED_LINK_GEOMETRY_INVALID',
                'Completion was skipped because required link geometry is invalid.',
                {
                    geometryErrors: requiredLinkGeometryReport ? requiredLinkGeometryReport.errors.length : null
                }
            ));
            return result;
        }

        if (plan.workingView.hull.length < 3) {
            result.errors.push(OFP.makeCompletionDiagnostic(
                'error',
                'HULL_TOO_SMALL',
                'Completion requires at least three hull portals.',
                {
                    hullPortals: plan.workingView.hull.length
                }
            ));
            return result;
        }

        if (plan.workingView.inner.length > 0) {
            result.errors.push(OFP.makeCompletionDiagnostic(
                'error',
                'INNER_PORTALS_NOT_SUPPORTED_IN_V0',
                'This minimal completion version only supports plans with no inner portals.',
                {
                    innerPortals: plan.workingView.inner.length
                }
            ));
            return result;
        }

        var fan = OFP.getFanTriangulationForHull(plan);
        var requiredLinksOutsideFan = OFP.findRequiredLinksOutsideFanTriangulation(plan, fan);

        result.stats.requiredLinksOutsideFan = requiredLinksOutsideFan.length;

        if (requiredLinksOutsideFan.length > 0) {
            result.errors.push(OFP.makeCompletionDiagnostic(
                'error',
                'REQUIRED_LINKS_NOT_IN_FAN_TRIANGULATION',
                'Some required links are not included in the current fan triangulation.',
                {
                    requiredLinksOutsideFan: requiredLinksOutsideFan
                }
            ));
            return result;
        }

        var completedLinkSet = {};
        var completedFieldIds = [];
        var hullEdgeLinkIds = OFP.getHullEdgeLinkIds(plan);

        hullEdgeLinkIds.forEach(function (linkId) {
            var parts = linkId.split('-');

            OFP.ensurePlanLinkIntent(plan, parts[0], parts[1], 'hullTriangulation', {
                role: 'hull_edge',
                hierarchyLevel: 0
            });

            completedLinkSet[linkId] = true;
        });

        fan.diagonalLinkIds.forEach(function (linkId) {
            var parts = linkId.split('-');

            OFP.ensurePlanLinkIntent(plan, parts[0], parts[1], 'hullTriangulation', {
                role: 'fan_diagonal',
                hierarchyLevel: 0
            });

            completedLinkSet[linkId] = true;
        });

        fan.triangles.forEach(function (triangle, triangleIndex) {
            var portalIds = triangle.map(function (pointIndex) {
                return OFP.getWorkingPortalId(plan, pointIndex);
            });

            var fieldId = OFP.ensurePlanFieldIntent(plan, portalIds, null, {
                source: 'fanTriangulation',
                triangleIndex: triangleIndex,
                pointIndices: triangle.slice()
            });

            completedFieldIds.push(fieldId);
        });

        var completedLinkIds = Object.keys(completedLinkSet).sort();

        plan.completionStructure = {
            hullPortalIds: plan.workingView.hull.map(function (pointIndex) {
                return OFP.getWorkingPortalId(plan, pointIndex);
            }),
            hullTriangulation: {
                mode: 'fan',
                rootPortalId: OFP.getWorkingPortalId(plan, plan.workingView.hull[0]),
                triangles: fan.triangles.map(function (triangle) {
                    return triangle.map(function (pointIndex) {
                        return OFP.getWorkingPortalId(plan, pointIndex);
                    });
                }),
                diagonalLinkIds: fan.diagonalLinkIds.slice().sort()
            },
            recursiveSplitTree: null,
            completedLinkIds: completedLinkIds,
            completedFieldIds: completedFieldIds.slice().sort(),
            metadata: {
                timestamp: new Date().toISOString(),
                seed: options.seed,
                mode: 'fan_no_inner_v0'
            }
        };

        result.success = true;
        result.stats.hullEdges = hullEdgeLinkIds.length;
        result.stats.diagonals = fan.diagonalLinkIds.length;
        result.stats.completedLinks = completedLinkIds.length;
        result.stats.completedFields = completedFieldIds.length;

        plan.metadata.counts.completedLinks = completedLinkIds.length;
        plan.metadata.counts.completedFields = completedFieldIds.length;

        return result;
    };

    OFP.COMPLETION_V1_MAX_ATTEMPTS = 64;
    OFP.COMPLETION_V1_MAX_DEPTH = 64;
    OFP.COMPLETION_V1_MAX_NODES = 5000;
    OFP.COMPLETION_V1_EPS = 1e-12;

    OFP.hashSeedToUint32 = function hashSeedToUint32(seed) {
        var str = String(seed || '');
        var hash = 2166136261;

        for (var i = 0; i < str.length; i += 1) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }

        return hash >>> 0;
    };

    OFP.makeSeededRng = function makeSeededRng(seed) {
        var state = OFP.hashSeedToUint32(seed);

        return function rng() {
            state += 0x6D2B79F5;
            var t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };

    OFP.shuffleWithRng = function shuffleWithRng(values, rng) {
        var arr = values.slice();

        for (var i = arr.length - 1; i > 0; i -= 1) {
            var j = Math.floor(rng() * (i + 1));
            var tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }

        return arr;
    };

    OFP.randomChoice = function randomChoice(values, rng) {
        if (!values.length) return null;
        return values[Math.floor(rng() * values.length)];
    };

    OFP.clonePlainObject = function clonePlainObject(value) {
        return JSON.parse(JSON.stringify(value));
    };

    OFP.getPortalPointForCompletion = function getPortalPointForCompletion(plan, portalId) {
        var portalRef = plan.portalMap[portalId];

        if (!portalRef || !portalRef.latLng) {
            return null;
        }

        return {
            portalId: portalId,
            lat: Number(portalRef.latLng.lat),
            lng: Number(portalRef.latLng.lng)
        };
    };

    OFP.orientPortalIds = function orientPortalIds(plan, portalIdA, portalIdB, portalIdC) {
        var a = OFP.getPortalPointForCompletion(plan, portalIdA);
        var b = OFP.getPortalPointForCompletion(plan, portalIdB);
        var c = OFP.getPortalPointForCompletion(plan, portalIdC);

        if (!a || !b || !c) return 0;

        return OFP.geometryOrient(a, b, c);
    };

    OFP.getCcwTrianglePortalIds = function getCcwTrianglePortalIds(plan, triangle) {
        if (OFP.orientPortalIds(plan, triangle[0], triangle[1], triangle[2]) >= 0) {
            return triangle.slice();
        }

        return [triangle[0], triangle[2], triangle[1]];
    };

    OFP.pointStrictlyInTriangle = function pointStrictlyInTriangle(point, a, b, c) {
        var o1 = OFP.geometryOrient(a, b, point);
        var o2 = OFP.geometryOrient(b, c, point);
        var o3 = OFP.geometryOrient(c, a, point);

        var eps = OFP.COMPLETION_V1_EPS;

        return (o1 > eps && o2 > eps && o3 > eps) ||
            (o1 < -eps && o2 < -eps && o3 < -eps);
    };

    OFP.portalStrictlyInTriangle = function portalStrictlyInTriangle(plan, portalId, triangle) {
        if (triangle.indexOf(portalId) >= 0) return false;

        var p = OFP.getPortalPointForCompletion(plan, portalId);
        var a = OFP.getPortalPointForCompletion(plan, triangle[0]);
        var b = OFP.getPortalPointForCompletion(plan, triangle[1]);
        var c = OFP.getPortalPointForCompletion(plan, triangle[2]);

        if (!p || !a || !b || !c) return false;

        return OFP.pointStrictlyInTriangle(p, a, b, c);
    };

    OFP.getPortalIdsStrictlyInsideTriangle = function getPortalIdsStrictlyInsideTriangle(
    plan,
     triangle,
     candidatePortalIds
    ) {
        return candidatePortalIds.filter(function (portalId) {
            return OFP.portalStrictlyInTriangle(plan, portalId, triangle);
        }).sort();
    };

    OFP.makeCompletionAttemptPlan = function makeCompletionAttemptPlan(plan) {
        return {
            portalMap: plan.portalMap,
            requiredPortalIds: plan.requiredPortalIds.slice(),
            requiredLinkIds: plan.requiredLinkIds.slice(),
            linkMap: OFP.clonePlainObject(plan.linkMap),
            fieldMap: OFP.clonePlainObject(plan.fieldMap || {}),

            completionStructure: null,
            dependencyGraph: plan.dependencyGraph,

            workingView: plan.workingView,
            diagnostics: plan.diagnostics,
            metadata: OFP.clonePlainObject(plan.metadata)
        };
    };

    OFP.makeCompletionAttemptState = function makeCompletionAttemptState(plan, options, attemptIndex) {
        return {
            plan: OFP.makeCompletionAttemptPlan(plan),
            rng: OFP.makeSeededRng(String(options.seed) + '#attempt:' + String(attemptIndex)),
            attemptIndex: attemptIndex,
            nodeCounter: 0,
            maxDepth: 0,
            splitNodes: 0,
            completedLinkSet: {},
            completedFieldSet: {},
            usedPortalSet: {},
            tree: {
                rootNodeIds: [],
                nodeMap: {},
                leafNodeIds: []
            },
            errors: [],
            warnings: []
        };
    };

    OFP.makeRecursiveSplitNodeId = function makeRecursiveSplitNodeId(attempt) {
        var nodeId = 'node:' + String(attempt.nodeCounter);
        attempt.nodeCounter += 1;
        return nodeId;
    };

    OFP.addAttemptWarning = function addAttemptWarning(attempt, code, message, details) {
        attempt.warnings.push(OFP.makeCompletionDiagnostic(
            'warning',
            code,
            message,
            details || null
        ));
    };

    OFP.addAttemptError = function addAttemptError(attempt, code, message, details) {
        attempt.errors.push(OFP.makeCompletionDiagnostic(
            'error',
            code,
            message,
            details || null
        ));
    };

    OFP.markPortalIdsUsedByField = function markPortalIdsUsedByField(attempt, portalIds) {
        portalIds.forEach(function (portalId) {
            attempt.usedPortalSet[portalId] = true;
        });
    };

    OFP.addCompletionLinkV1 = function addCompletionLinkV1(
    attempt,
     portalIdA,
     portalIdB,
     source,
     metadata
    ) {
        if (portalIdA === portalIdB) {
            OFP.addAttemptError(attempt, 'COMPLETION_SELF_LINK', 'Completion attempted to add a self-link.', {
                portalId: portalIdA
            });
            return null;
        }

        var linkId = OFP.ensurePlanLinkIntent(
            attempt.plan,
            portalIdA,
            portalIdB,
            source,
            metadata || {}
        );

        attempt.completedLinkSet[linkId] = true;

        return linkId;
    };

    OFP.addCompletionFieldV1 = function addCompletionFieldV1(
    attempt,
     triangle,
     parentFieldId,
     metadata
    ) {
        var ccwTriangle = OFP.getCcwTrianglePortalIds(attempt.plan, triangle);
        var fieldId = OFP.ensurePlanFieldIntent(
            attempt.plan,
            ccwTriangle,
            parentFieldId || null,
            metadata || {}
        );

        if (parentFieldId && attempt.plan.fieldMap[parentFieldId]) {
            var parentField = attempt.plan.fieldMap[parentFieldId];

            if (!Array.isArray(parentField.childFieldIds)) {
                parentField.childFieldIds = [];
            }

            if (parentField.childFieldIds.indexOf(fieldId) < 0) {
                parentField.childFieldIds.push(fieldId);
            }
        }

        if (attempt.plan.fieldMap[fieldId]) {
            attempt.plan.fieldMap[fieldId].parentFieldId = parentFieldId || null;
        }

        attempt.completedFieldSet[fieldId] = true;
        OFP.markPortalIdsUsedByField(attempt, ccwTriangle);

        return fieldId;
    };

    OFP.buildSeededHullTriangulationV1 = function buildSeededHullTriangulationV1(plan, rng) {
        var hullPortalIds = plan.workingView.hull.map(function (pointIndex) {
            return OFP.getWorkingPortalId(plan, pointIndex);
        });

        if (hullPortalIds.length < 3) {
            return {
                rootPortalId: null,
                triangles: [],
                diagonalLinkIds: []
            };
        }

        var rootPosition = Math.floor(rng() * hullPortalIds.length);
        var ordered = hullPortalIds.slice(rootPosition).concat(hullPortalIds.slice(0, rootPosition));
        var rootPortalId = ordered[0];

        var triangles = [];
        var diagonalLinkIds = [];

        for (var i = 1; i < ordered.length - 1; i += 1) {
            triangles.push(OFP.getCcwTrianglePortalIds(plan, [
                rootPortalId,
                ordered[i],
                ordered[i + 1]
            ]));
        }

        for (var j = 2; j < ordered.length - 1; j += 1) {
            diagonalLinkIds.push(OFP.getCanonicalLinkId(rootPortalId, ordered[j]));
        }

        return {
            rootPortalId: rootPortalId,
            triangles: triangles,
            diagonalLinkIds: diagonalLinkIds.slice().sort()
        };
    };

    OFP.getHullEdgeLinkIdsByPortalIds = function getHullEdgeLinkIdsByPortalIds(plan) {
        var hullPortalIds = plan.workingView.hull.map(function (pointIndex) {
            return OFP.getWorkingPortalId(plan, pointIndex);
        });

        var linkIds = [];

        for (var i = 0; i < hullPortalIds.length; i += 1) {
            linkIds.push(OFP.getCanonicalLinkId(
                hullPortalIds[i],
                hullPortalIds[(i + 1) % hullPortalIds.length]
            ));
        }

        return linkIds;
    };

    OFP.completeTriangleRecursiveV1 = function completeTriangleRecursiveV1(
    attempt,
     triangle,
     candidatePortalIds,
     parentNodeId,
     parentFieldId,
     level
    ) {
        if (attempt.errors.length > 0) return null;

        if (level > OFP.COMPLETION_V1_MAX_DEPTH) {
            OFP.addAttemptError(attempt, 'COMPLETION_V1_MAX_DEPTH_EXCEEDED', 'Completion depth limit was exceeded.', {
                level: level,
                maxDepth: OFP.COMPLETION_V1_MAX_DEPTH,
                triangle: triangle
            });
            return null;
        }

        if (attempt.nodeCounter >= OFP.COMPLETION_V1_MAX_NODES) {
            OFP.addAttemptError(attempt, 'COMPLETION_V1_MAX_NODES_EXCEEDED', 'Completion node limit was exceeded.', {
                maxNodes: OFP.COMPLETION_V1_MAX_NODES
            });
            return null;
        }

        attempt.maxDepth = Math.max(attempt.maxDepth, level);

        var nodeId = OFP.makeRecursiveSplitNodeId(attempt);
        var ccwTriangle = OFP.getCcwTrianglePortalIds(attempt.plan, triangle);

        var fieldId = OFP.addCompletionFieldV1(attempt, ccwTriangle, parentFieldId, {
            source: 'recursiveSplit',
            nodeId: nodeId,
            hierarchyLevel: level
        });

        var node = {
            id: nodeId,
            triangle: ccwTriangle,
            level: level,
            parentNodeId: parentNodeId || null,
            splitPortalId: null,
            childNodeIds: [],
            fieldId: fieldId,
            linkIds: []
        };

        attempt.tree.nodeMap[nodeId] = node;

        if (!parentNodeId) {
            attempt.tree.rootNodeIds.push(nodeId);
        } else if (attempt.tree.nodeMap[parentNodeId]) {
            attempt.tree.nodeMap[parentNodeId].childNodeIds.push(nodeId);
        }

        var insideIds = OFP.getPortalIdsStrictlyInsideTriangle(
            attempt.plan,
            ccwTriangle,
            candidatePortalIds
        );

        if (!insideIds.length) {
            attempt.tree.leafNodeIds.push(nodeId);
            return nodeId;
        }

        var orderedCandidates = OFP.shuffleWithRng(insideIds, attempt.rng);
        var splitPortalId = orderedCandidates[0];

        node.splitPortalId = splitPortalId;
        attempt.splitNodes += 1;

        ccwTriangle.forEach(function (vertexPortalId) {
            var linkId = OFP.addCompletionLinkV1(
                attempt,
                splitPortalId,
                vertexPortalId,
                'recursiveSplit',
                {
                    role: 'split_link',
                    hierarchyLevel: level + 1,
                    nodeId: nodeId,
                    splitPortalId: splitPortalId
                }
            );

            if (linkId) {
                node.linkIds.push(linkId);
            }
        });

        var remainingCandidates = insideIds.filter(function (portalId) {
            return portalId !== splitPortalId;
        });

        var childTriangles = [
            [ccwTriangle[0], ccwTriangle[1], splitPortalId],
            [ccwTriangle[1], ccwTriangle[2], splitPortalId],
            [ccwTriangle[2], ccwTriangle[0], splitPortalId]
        ].map(function (childTriangle) {
            return OFP.getCcwTrianglePortalIds(attempt.plan, childTriangle);
        });

        childTriangles = OFP.shuffleWithRng(childTriangles, attempt.rng);

        var assignedToChild = {};

        childTriangles.forEach(function (childTriangle) {
            var childCandidateIds = OFP.getPortalIdsStrictlyInsideTriangle(
                attempt.plan,
                childTriangle,
                remainingCandidates
            );

            childCandidateIds.forEach(function (portalId) {
                assignedToChild[portalId] = true;
            });

            OFP.completeTriangleRecursiveV1(
                attempt,
                childTriangle,
                childCandidateIds,
                nodeId,
                fieldId,
                level + 1
            );
        });

        remainingCandidates.forEach(function (portalId) {
            if (!assignedToChild[portalId]) {
                OFP.addAttemptWarning(
                    attempt,
                    'INNER_PORTAL_ON_SPLIT_BOUNDARY_IGNORED',
                    'An inner portal was not assigned to any child triangle, likely because it lies on a split boundary.',
                    {
                        portalId: portalId,
                        parentNodeId: nodeId,
                        triangle: ccwTriangle,
                        splitPortalId: splitPortalId
                    }
                );
            }
        });

        return nodeId;
    };

    OFP.getUncoveredRequiredLinks = function getUncoveredRequiredLinks(plan, completedLinkSet) {
        return plan.requiredLinkIds.filter(function (linkId) {
            return !completedLinkSet[linkId];
        });
    };

    OFP.getUnusedRequiredPortals = function getUnusedRequiredPortals(plan, usedPortalSet) {
        return plan.requiredPortalIds.filter(function (portalId) {
            return !usedPortalSet[portalId];
        });
    };

    OFP.validateCompletedLinkGeometryV1 = function validateCompletedLinkGeometryV1(attempt) {
        var linkIds = Object.keys(attempt.completedLinkSet).sort();
        var errors = [];

        for (var i = 0; i < linkIds.length; i += 1) {
            var linkA = attempt.plan.linkMap[linkIds[i]];
            if (!linkA) continue;

            for (var j = i + 1; j < linkIds.length; j += 1) {
                var linkB = attempt.plan.linkMap[linkIds[j]];
                if (!linkB) continue;

                var relation = OFP.classifyRequiredLinkPairGeometry(attempt.plan, linkA, linkB);

                if (relation.isError) {
                    errors.push({
                        linkIdA: linkIds[i],
                        linkIdB: linkIds[j],
                        relation: relation.relation
                    });
                }
            }
        }

        return errors;
    };

    OFP.runCompletionAttemptV1 = function runCompletionAttemptV1(
    plan,
     options,
     requiredLinkGeometryReport,
     attemptIndex
    ) {
        var attempt = OFP.makeCompletionAttemptState(plan, options, attemptIndex);

        if (plan.diagnostics.errors.length > 0) {
            OFP.addAttemptError(attempt, 'PLAN_HAS_ERRORS', 'Completion was skipped because the Plan has errors.', {
                planErrors: plan.diagnostics.errors.length
            });
            return attempt;
        }

        if (!requiredLinkGeometryReport || !requiredLinkGeometryReport.isValid) {
            OFP.addAttemptError(attempt, 'REQUIRED_LINK_GEOMETRY_INVALID', 'Completion was skipped because required link geometry is invalid.', {
                geometryErrors: requiredLinkGeometryReport ? requiredLinkGeometryReport.errors.length : null
            });
            return attempt;
        }

        if (plan.workingView.hull.length < 3) {
            OFP.addAttemptError(attempt, 'HULL_TOO_SMALL', 'Completion requires at least three hull portals.', {
                hullPortals: plan.workingView.hull.length
            });
            return attempt;
        }

        var hullTriangulation = OFP.buildSeededHullTriangulationV1(attempt.plan, attempt.rng);

        var hullEdgeLinkIds = OFP.getHullEdgeLinkIdsByPortalIds(attempt.plan);

        hullEdgeLinkIds.forEach(function (linkId) {
            var link = linkId.split('-');

            OFP.addCompletionLinkV1(
                attempt,
                link[0],
                link[1],
                'hullTriangulation',
                {
                    role: 'hull_edge',
                    hierarchyLevel: 0
                }
            );
        });

        hullTriangulation.diagonalLinkIds.forEach(function (linkId) {
            var link = linkId.split('-');

            OFP.addCompletionLinkV1(
                attempt,
                link[0],
                link[1],
                'hullTriangulation',
                {
                    role: 'fan_diagonal',
                    hierarchyLevel: 0
                }
            );
        });

        var allCandidatePortalIds = attempt.plan.requiredPortalIds.slice().sort();

        hullTriangulation.triangles.forEach(function (triangle) {
            var insideIds = OFP.getPortalIdsStrictlyInsideTriangle(
                attempt.plan,
                triangle,
                allCandidatePortalIds
            );

            OFP.completeTriangleRecursiveV1(
                attempt,
                triangle,
                insideIds,
                null,
                null,
                0
            );
        });

        var uncoveredRequiredLinks = OFP.getUncoveredRequiredLinks(
            attempt.plan,
            attempt.completedLinkSet
        );

        if (uncoveredRequiredLinks.length > 0) {
            OFP.addAttemptError(
                attempt,
                'REQUIRED_LINKS_NOT_COVERED_IN_COMPLETION_V1',
                'Some required links are not included in the recursive completion.',
                {
                    uncoveredRequiredLinks: uncoveredRequiredLinks
                }
            );
        }

        var unusedRequiredPortals = OFP.getUnusedRequiredPortals(
            attempt.plan,
            attempt.usedPortalSet
        );

        if (unusedRequiredPortals.length > 0) {
            OFP.addAttemptError(
                attempt,
                'REQUIRED_PORTALS_NOT_USED_IN_COMPLETION_V1',
                'Some required portals were not used by any completed field.',
                {
                    unusedRequiredPortals: unusedRequiredPortals
                }
            );
        }

        var geometryErrors = OFP.validateCompletedLinkGeometryV1(attempt);

        if (geometryErrors.length > 0) {
            OFP.addAttemptError(
                attempt,
                'COMPLETED_LINK_GEOMETRY_INVALID',
                'Completed links contain a geometric conflict.',
                {
                    geometryErrors: geometryErrors.slice(0, 20),
                    geometryErrorCount: geometryErrors.length
                }
            );
        }

        var completedLinkIds = Object.keys(attempt.completedLinkSet).sort();
        var completedFieldIds = Object.keys(attempt.completedFieldSet).sort();

        attempt.plan.completionStructure = {
            hullPortalIds: attempt.plan.workingView.hull.map(function (pointIndex) {
                return OFP.getWorkingPortalId(attempt.plan, pointIndex);
            }),
            hullTriangulation: {
                mode: 'seeded_fan',
                rootPortalId: hullTriangulation.rootPortalId,
                triangles: hullTriangulation.triangles.map(function (triangle) {
                    return triangle.slice();
                }),
                diagonalLinkIds: hullTriangulation.diagonalLinkIds.slice().sort()
            },
            recursiveSplitTree: {
                rootNodeIds: attempt.tree.rootNodeIds.slice(),
                nodeMap: attempt.tree.nodeMap,
                leafNodeIds: attempt.tree.leafNodeIds.slice()
            },
            completedLinkIds: completedLinkIds,
            completedFieldIds: completedFieldIds,
            metadata: {
                timestamp: new Date().toISOString(),
                seed: options.seed,
                attemptIndex: attemptIndex,
                mode: 'recursive_apollonian_v1',
                maxDepth: attempt.maxDepth,
                splitNodes: attempt.splitNodes,
                nodeCount: attempt.nodeCounter,
                leafFields: attempt.tree.leafNodeIds.length
            }
        };

        attempt.plan.metadata.counts.completedLinks = completedLinkIds.length;
        attempt.plan.metadata.counts.completedFields = completedFieldIds.length;

        return attempt;
    };

    OFP.completePlanV1 = function completePlanV1(plan, options, requiredLinkGeometryReport) {
        var finalResult = {
            success: false,
            errors: [],
            warnings: [],
            stats: {
                attempts: 0,
                hullPortals: plan.workingView.hull.length,
                innerPortals: plan.workingView.inner.length,
                hullEdges: 0,
                diagonals: 0,
                completedLinks: 0,
                completedFields: 0,
                requiredLinksOutsideFan: 0,
                requiredLinksUncovered: 0,
                unusedRequiredPortals: 0,
                maxDepth: 0,
                splitNodes: 0,
                leafFields: 0,
                nodeCount: 0
            },
            metadata: {
                timestamp: new Date().toISOString(),
                seed: options.seed,
                mode: 'recursive_apollonian_v1'
            }
        };

        var lastAttempt = null;

        for (var attemptIndex = 0; attemptIndex < OFP.COMPLETION_V1_MAX_ATTEMPTS; attemptIndex += 1) {
            var attempt = OFP.runCompletionAttemptV1(
                plan,
                options,
                requiredLinkGeometryReport,
                attemptIndex
            );

            lastAttempt = attempt;
            finalResult.stats.attempts = attemptIndex + 1;

            if (attempt.errors.length === 0 && attempt.plan.completionStructure) {
                plan.linkMap = attempt.plan.linkMap;
                plan.fieldMap = attempt.plan.fieldMap;
                plan.completionStructure = attempt.plan.completionStructure;
                plan.metadata.counts.completedLinks = attempt.plan.metadata.counts.completedLinks;
                plan.metadata.counts.completedFields = attempt.plan.metadata.counts.completedFields;

                finalResult.success = true;
                finalResult.warnings = attempt.warnings.slice();

                finalResult.stats.hullEdges = OFP.getHullEdgeLinkIdsByPortalIds(plan).length;
                finalResult.stats.diagonals = plan.completionStructure.hullTriangulation.diagonalLinkIds.length;
                finalResult.stats.completedLinks = plan.completionStructure.completedLinkIds.length;
                finalResult.stats.completedFields = plan.completionStructure.completedFieldIds.length;
                finalResult.stats.maxDepth = plan.completionStructure.metadata.maxDepth;
                finalResult.stats.splitNodes = plan.completionStructure.metadata.splitNodes;
                finalResult.stats.leafFields = plan.completionStructure.metadata.leafFields;
                finalResult.stats.nodeCount = plan.completionStructure.metadata.nodeCount;

                finalResult.metadata.attemptIndex = attemptIndex;

                return finalResult;
            }
        }

        finalResult.errors.push(OFP.makeCompletionDiagnostic(
            'error',
            'COMPLETION_V1_NO_VALID_ATTEMPT',
            'No valid recursive completion was found within the attempt limit.',
            {
                maxAttempts: OFP.COMPLETION_V1_MAX_ATTEMPTS,
                lastAttemptErrors: lastAttempt ? lastAttempt.errors : []
            }
        ));

        if (lastAttempt) {
            finalResult.warnings = lastAttempt.warnings.slice();

            var uncovered = lastAttempt.errors.filter(function (entry) {
                return entry.code === 'REQUIRED_LINKS_NOT_COVERED_IN_COMPLETION_V1';
            });

            if (uncovered.length && uncovered[0].details && uncovered[0].details.uncoveredRequiredLinks) {
                finalResult.stats.requiredLinksUncovered = uncovered[0].details.uncoveredRequiredLinks.length;
            }

            var unused = lastAttempt.errors.filter(function (entry) {
                return entry.code === 'REQUIRED_PORTALS_NOT_USED_IN_COMPLETION_V1';
            });

            if (unused.length && unused[0].details && unused[0].details.unusedRequiredPortals) {
                finalResult.stats.unusedRequiredPortals = unused[0].details.unusedRequiredPortals.length;
            }
        }

        return finalResult;
    };

    OFP.COMPLETION_V2_MAX_ATTEMPTS = 256;
    OFP.COMPLETION_V2_MAX_DEPTH = 128;
    OFP.COMPLETION_V2_MAX_NODES = 20000;
    OFP.COMPLETION_V2_EPS = 1e-12;

    OFP.getCompletionErrorCodeCounts = function getCompletionErrorCodeCounts(errors) {
        var counts = {};

        (errors || []).forEach(function (entry) {
            var code = entry && entry.code ? entry.code : 'UNKNOWN_ERROR';
            counts[code] = (counts[code] || 0) + 1;
        });

        return counts;
    };

    OFP.getTopCompletionErrorCode = function getTopCompletionErrorCode(errorCodeCounts) {
        var topCode = null;
        var topCount = 0;

        Object.keys(errorCodeCounts || {}).forEach(function (code) {
            if (errorCodeCounts[code] > topCount) {
                topCode = code;
                topCount = errorCodeCounts[code];
            }
        });

        return {
            code: topCode,
            count: topCount
        };
    };

    OFP.getFirstCompletionError = function getFirstCompletionError(attempt) {
        if (!attempt || !attempt.errors || !attempt.errors.length) {
            return null;
        }

        return attempt.errors[0];
    };

    OFP.makeCompletionAttemptSummary = function makeCompletionAttemptSummary(attempt) {
        var firstError = OFP.getFirstCompletionError(attempt);
        var details = firstError && firstError.details ? firstError.details : {};
        var rootInfo = attempt && attempt.rootInfo ? attempt.rootInfo : {};

        return {
            attemptIndex: attempt ? attempt.attemptIndex : null,
            rootPortalId: rootInfo.rootPortalId || details.rootPortalId || null,
            hullTriangulationMode: rootInfo.mode || null,
            rootTriangleCount: rootInfo.triangleCount || null,
            rootDiagonalCount: rootInfo.diagonalCount || null,
            requiredHullDiagonalCount: rootInfo.requiredHullDiagonalIds
            ? rootInfo.requiredHullDiagonalIds.length
            : null,

            errorCount: attempt && attempt.errors ? attempt.errors.length : 0,
            warningCount: attempt && attempt.warnings ? attempt.warnings.length : 0,

            firstErrorCode: firstError ? firstError.code : null,
            firstErrorMessage: firstError ? firstError.message : null,

            triangle: details.triangle || null,
            level: typeof details.level === 'number' ? details.level : null,
            requiredLinkIdsInTriangle: details.requiredLinkIdsInTriangle || null,
            forcedSplitPortalIds: details.forcedSplitPortalIds || null,
            rejectedCandidateCount: typeof details.rejectedCandidateCount === 'number'
            ? details.rejectedCandidateCount
            : null,
            rejectedCandidates: details.rejectedCandidates || null,

            rootAssignmentFailures: details.failures || null,
            failureCount: typeof details.failureCount === 'number'
            ? details.failureCount
            : null,

            errors: attempt && attempt.errors ? attempt.errors.slice() : [],
            warnings: attempt && attempt.warnings ? attempt.warnings.slice() : []
        };
    };

    OFP.makeCompletionFailureReport = function makeCompletionFailureReport(
    attemptSummaries,
     lastAttempt,
     successfulAttemptIndex
    ) {
        var summaries = attemptSummaries || [];
        var allFirstErrors = [];

        summaries.forEach(function (summary) {
            if (summary.firstErrorCode) {
                allFirstErrors.push({
                    code: summary.firstErrorCode,
                    message: summary.firstErrorMessage,
                    details: {
                        attemptIndex: summary.attemptIndex,
                        rootPortalId: summary.rootPortalId,
                        hullTriangulationMode: summary.hullTriangulationMode,
                        requiredHullDiagonalCount: summary.requiredHullDiagonalCount,
                        triangle: summary.triangle,
                        level: summary.level,
                        requiredLinkIdsInTriangle: summary.requiredLinkIdsInTriangle,
                        forcedSplitPortalIds: summary.forcedSplitPortalIds,
                        rejectedCandidateCount: summary.rejectedCandidateCount,
                        failureCount: summary.failureCount
                    }
                });
            }
        });

        var codeCounts = OFP.getCompletionErrorCodeCounts(allFirstErrors);
        var top = OFP.getTopCompletionErrorCode(codeCounts);

        var firstFailingTriangle = null;
        var firstFailingRequiredLinks = null;

        for (var i = 0; i < summaries.length; i += 1) {
            if (summaries[i].triangle) {
                firstFailingTriangle = summaries[i].triangle;
                firstFailingRequiredLinks = summaries[i].requiredLinkIdsInTriangle || null;
                break;
            }
        }

        var lastErrors = lastAttempt && lastAttempt.errors ? lastAttempt.errors.slice() : [];
        var lastError = lastErrors.length ? lastErrors[0] : null;

        return {
            success: typeof successfulAttemptIndex === 'number',
            successfulAttemptIndex: typeof successfulAttemptIndex === 'number'
            ? successfulAttemptIndex
            : null,
            failedAttempts: typeof successfulAttemptIndex === 'number'
            ? successfulAttemptIndex
            : summaries.length,
            totalAttempts: summaries.length,

            errorCodeCounts: codeCounts,
            topErrorCode: top.code,
            topErrorCount: top.count,

            lastErrorCode: lastError ? lastError.code : null,
            lastErrorMessage: lastError ? lastError.message : null,
            lastAttemptErrors: lastErrors,

            firstFailingTriangle: firstFailingTriangle,
            firstFailingRequiredLinks: firstFailingRequiredLinks,

            attemptSummaries: summaries,
            metadata: {
                timestamp: new Date().toISOString()
            }
        };
    };

    OFP.formatCompletionFailureReportSummaryLines = function formatCompletionFailureReportSummaryLines(report) {
        if (!report) {
            return [
                'Completion diagnostics:',
                '- available: false'
            ];
        }

        if (report.success) {
            return [
                'Completion diagnostics:',
                '- available: true',
                '- successful attempt: ' + String(report.successfulAttemptIndex),
                '- failed attempts before success: ' + String(report.failedAttempts),
                '- top pre-success error: ' + String(report.topErrorCode || 'none'),
                '- top pre-success error count: ' + String(report.topErrorCount || 0)
            ];
        }

        return [
            'Completion diagnostics:',
            '- available: true',
            '- failed attempts: ' + String(report.failedAttempts),
            '- distinct error codes: ' + String(Object.keys(report.errorCodeCounts || {}).length),
            '- top error: ' + String(report.topErrorCode || 'none'),
            '- top error count: ' + String(report.topErrorCount || 0),
            '- last error: ' + String(report.lastErrorCode || 'none'),
            '- first failing triangle: ' + (
                report.firstFailingTriangle
                ? report.firstFailingTriangle.join(', ')
                : 'none'
            ),
            '- first failing required links: ' + (
                report.firstFailingRequiredLinks
                ? String(report.firstFailingRequiredLinks.length)
                : 'none'
            )
        ];
    };

    OFP.makeCompletionAttemptStateV2 = function makeCompletionAttemptStateV2(plan, options, attemptIndex) {
        return {
            plan: OFP.makeCompletionAttemptPlan(plan),
            rng: OFP.makeSeededRng(String(options.seed) + '#v2-attempt:' + String(attemptIndex)),
            attemptIndex: attemptIndex,
            nodeCounter: 0,
            maxDepth: 0,
            splitNodes: 0,
            completedLinkSet: {},
            completedFieldSet: {},
            usedPortalSet: {},
            tree: {
                rootNodeIds: [],
                nodeMap: {},
                leafNodeIds: []
            },
            errors: [],
            warnings: []
        };
    };

    OFP.getRequiredLinkEndpointIds = function getRequiredLinkEndpointIds(plan, linkId) {
        var link = plan.linkMap[linkId];

        if (!link) return null;

        return {
            from: link.from,
            to: link.to
        };
    };

    OFP.triangleContainsPortalId = function triangleContainsPortalId(triangle, portalId) {
        return triangle.indexOf(portalId) >= 0;
    };

    OFP.isTriangleBoundaryLink = function isTriangleBoundaryLink(triangle, linkId) {
        var endpoints = linkId.split('-');

        if (endpoints.length < 2) return false;

        return OFP.triangleContainsPortalId(triangle, endpoints[0]) &&
            OFP.triangleContainsPortalId(triangle, endpoints[1]);
    };

    OFP.getTriangleSplitLinkIds = function getTriangleSplitLinkIds(triangle, splitPortalId) {
        return triangle.map(function (vertexPortalId) {
            return OFP.getCanonicalLinkId(splitPortalId, vertexPortalId);
        });
    };

    OFP.classifyPortalAgainstTriangleForAssignment = function classifyPortalAgainstTriangleForAssignment(
    plan,
     portalId,
     triangle
    ) {
        if (OFP.triangleContainsPortalId(triangle, portalId)) {
            return 'vertex';
        }

        var point = OFP.getPortalPointForCompletion(plan, portalId);
        var a = OFP.getPortalPointForCompletion(plan, triangle[0]);
        var b = OFP.getPortalPointForCompletion(plan, triangle[1]);
        var c = OFP.getPortalPointForCompletion(plan, triangle[2]);

        if (!point || !a || !b || !c) {
            return 'outside';
        }

        if (OFP.pointStrictlyInTriangle(point, a, b, c)) {
            return 'strict_inside';
        }

        if (
            OFP.geometryPointOnSegment(a, b, point) ||
            OFP.geometryPointOnSegment(b, c, point) ||
            OFP.geometryPointOnSegment(c, a, point)
        ) {
            return 'boundary_non_vertex';
        }

        return 'outside';
    };

    OFP.isCleanTriangleAssignmentClass = function isCleanTriangleAssignmentClass(value) {
        return value === 'vertex' || value === 'strict_inside';
    };

    OFP.canAssignRequiredLinkToChildTriangle = function canAssignRequiredLinkToChildTriangle(
    plan,
     linkId,
     childTriangle
    ) {
        var endpoints = OFP.getRequiredLinkEndpointIds(plan, linkId);

        if (!endpoints) {
            return {
                canAssign: false,
                reason: 'missing_link'
            };
        }

        var fromClass = OFP.classifyPortalAgainstTriangleForAssignment(
            plan,
            endpoints.from,
            childTriangle
        );
        var toClass = OFP.classifyPortalAgainstTriangleForAssignment(
            plan,
            endpoints.to,
            childTriangle
        );

        if (
            OFP.isCleanTriangleAssignmentClass(fromClass) &&
            OFP.isCleanTriangleAssignmentClass(toClass)
        ) {
            return {
                canAssign: true,
                reason: 'clean'
            };
        }

        if (fromClass === 'boundary_non_vertex' || toClass === 'boundary_non_vertex') {
            return {
                canAssign: false,
                reason: 'boundary_non_vertex',
                fromClass: fromClass,
                toClass: toClass
            };
        }

        return {
            canAssign: false,
            reason: 'outside',
            fromClass: fromClass,
            toClass: toClass
        };
    };

    OFP.assignRequiredLinksToTrianglesCleanly = function assignRequiredLinksToTrianglesCleanly(
    plan,
     requiredLinkIds,
     triangles,
     completedLinkSet
    ) {
        var buckets = triangles.map(function () {
            return [];
        });

        var consumedLinkIds = [];
        var failures = [];

        requiredLinkIds.forEach(function (linkId) {
            if (completedLinkSet && completedLinkSet[linkId]) {
                consumedLinkIds.push(linkId);
                return;
            }

            var matchingTriangleIndexes = [];
            var boundaryFailure = null;

            triangles.forEach(function (triangle, triangleIndex) {
                var result = OFP.canAssignRequiredLinkToChildTriangle(plan, linkId, triangle);

                if (result.canAssign) {
                    matchingTriangleIndexes.push(triangleIndex);
                } else if (result.reason === 'boundary_non_vertex') {
                    boundaryFailure = {
                        triangleIndex: triangleIndex,
                        reason: result.reason,
                        fromClass: result.fromClass,
                        toClass: result.toClass
                    };
                }
            });

            if (matchingTriangleIndexes.length === 1) {
                buckets[matchingTriangleIndexes[0]].push(linkId);
                return;
            }

            failures.push({
                linkId: linkId,
                reason: matchingTriangleIndexes.length > 1
                ? 'multiple_child_triangles'
                : (boundaryFailure ? 'boundary_non_vertex' : 'no_child_triangle'),
                matchingTriangleIndexes: matchingTriangleIndexes,
                boundaryFailure: boundaryFailure
            });
        });

        return {
            success: failures.length === 0,
            buckets: buckets,
            consumedLinkIds: consumedLinkIds,
            failures: failures
        };
    };

    OFP.assignRequiredLinksAfterSplitV2 = function assignRequiredLinksAfterSplitV2(
    plan,
     triangle,
     splitPortalId,
     requiredLinkIdsInTriangle
    ) {
        var ccwTriangle = OFP.getCcwTrianglePortalIds(plan, triangle);
        var splitLinkIdSet = {};

        OFP.getTriangleSplitLinkIds(ccwTriangle, splitPortalId).forEach(function (linkId) {
            splitLinkIdSet[linkId] = true;
        });

        var childTriangles = [
            [ccwTriangle[0], ccwTriangle[1], splitPortalId],
            [ccwTriangle[1], ccwTriangle[2], splitPortalId],
            [ccwTriangle[2], ccwTriangle[0], splitPortalId]
        ].map(function (childTriangle) {
            return OFP.getCcwTrianglePortalIds(plan, childTriangle);
        });

        var childRequiredLinkIds = [[], [], []];
        var consumedLinkIds = [];
        var failures = [];

        requiredLinkIdsInTriangle.forEach(function (linkId) {
            if (splitLinkIdSet[linkId]) {
                consumedLinkIds.push(linkId);
                return;
            }

            // Defensive handling: a required link that is already a boundary of the current
            // triangle is already covered by previous hull / split construction.
            if (OFP.isTriangleBoundaryLink(ccwTriangle, linkId)) {
                consumedLinkIds.push(linkId);
                return;
            }

            var matchingChildIndexes = [];
            var boundaryFailure = null;

            childTriangles.forEach(function (childTriangle, childIndex) {
                var result = OFP.canAssignRequiredLinkToChildTriangle(plan, linkId, childTriangle);

                if (result.canAssign) {
                    matchingChildIndexes.push(childIndex);
                } else if (result.reason === 'boundary_non_vertex') {
                    boundaryFailure = {
                        childIndex: childIndex,
                        reason: result.reason,
                        fromClass: result.fromClass,
                        toClass: result.toClass
                    };
                }
            });

            if (matchingChildIndexes.length === 1) {
                childRequiredLinkIds[matchingChildIndexes[0]].push(linkId);
                return;
            }

            failures.push({
                linkId: linkId,
                splitPortalId: splitPortalId,
                reason: matchingChildIndexes.length > 1
                ? 'multiple_child_triangles'
                : (boundaryFailure ? 'boundary_non_vertex' : 'no_child_triangle'),
                matchingChildIndexes: matchingChildIndexes,
                boundaryFailure: boundaryFailure
            });
        });

        return {
            success: failures.length === 0,
            childTriangles: childTriangles,
            childRequiredLinkIds: childRequiredLinkIds,
            consumedLinkIds: consumedLinkIds,
            failures: failures
        };
    };

    OFP.findForcedSplitPortalIdsV2 = function findForcedSplitPortalIdsV2(
    plan,
     triangle,
     requiredLinkIdsInTriangle,
     insidePortalIds
    ) {
        var requiredLinkSet = {};

        requiredLinkIdsInTriangle.forEach(function (linkId) {
            requiredLinkSet[linkId] = true;
        });

        return insidePortalIds.filter(function (portalId) {
            return triangle.every(function (vertexPortalId) {
                return requiredLinkSet[OFP.getCanonicalLinkId(portalId, vertexPortalId)];
            });
        }).sort();
    };

    OFP.getCleanChildCandidateIdsV2 = function getCleanChildCandidateIdsV2(
    plan,
     childTriangle,
     candidatePortalIds
    ) {
        return candidatePortalIds.filter(function (portalId) {
            return OFP.portalStrictlyInTriangle(plan, portalId, childTriangle);
        }).sort();
    };

    OFP.completeTriangleRecursiveV2 = function completeTriangleRecursiveV2(
    attempt,
     triangle,
     candidatePortalIds,
     requiredLinkIdsInTriangle,
     parentNodeId,
     parentFieldId,
     level
    ) {
        if (attempt.errors.length > 0) return null;

        if (level > OFP.COMPLETION_V2_MAX_DEPTH) {
            OFP.addAttemptError(attempt, 'COMPLETION_V2_MAX_DEPTH_EXCEEDED', 'Completion depth limit was exceeded.', {
                level: level,
                maxDepth: OFP.COMPLETION_V2_MAX_DEPTH,
                triangle: triangle
            });
            return null;
        }

        if (attempt.nodeCounter >= OFP.COMPLETION_V2_MAX_NODES) {
            OFP.addAttemptError(attempt, 'COMPLETION_V2_MAX_NODES_EXCEEDED', 'Completion node limit was exceeded.', {
                maxNodes: OFP.COMPLETION_V2_MAX_NODES
            });
            return null;
        }

        attempt.maxDepth = Math.max(attempt.maxDepth, level);

        var ccwTriangle = OFP.getCcwTrianglePortalIds(attempt.plan, triangle);
        var insideIds = OFP.getPortalIdsStrictlyInsideTriangle(
            attempt.plan,
            ccwTriangle,
            candidatePortalIds
        );

        var forcedSplitPortalIds = OFP.findForcedSplitPortalIdsV2(
            attempt.plan,
            ccwTriangle,
            requiredLinkIdsInTriangle,
            insideIds
        );

        if (forcedSplitPortalIds.length > 1) {
            OFP.addAttemptError(
                attempt,
                'REQUIRED_LINKS_FORCE_MULTIPLE_SPLIT_POINTS',
                'Required links force multiple split portals in one triangle.',
                {
                    triangle: ccwTriangle,
                    level: level,
                    forcedSplitPortalIds: forcedSplitPortalIds,
                    requiredLinkIdsInTriangle: requiredLinkIdsInTriangle
                }
            );
            return null;
        }

        if (insideIds.length === 0) {
            if (requiredLinkIdsInTriangle.length > 0) {
                OFP.addAttemptError(
                    attempt,
                    'REQUIRED_LINKS_REMAIN_IN_LEAF_TRIANGLE',
                    'A leaf triangle still has required links assigned to it.',
                    {
                        triangle: ccwTriangle,
                        level: level,
                        requiredLinkIdsInTriangle: requiredLinkIdsInTriangle
                    }
                );
                return null;
            }

            var leafNodeId = OFP.makeRecursiveSplitNodeId(attempt);
            var leafFieldId = OFP.addCompletionFieldV1(attempt, ccwTriangle, parentFieldId, {
                source: 'recursiveSplitV2',
                nodeId: leafNodeId,
                hierarchyLevel: level
            });

            var leafNode = {
                id: leafNodeId,
                triangle: ccwTriangle,
                level: level,
                parentNodeId: parentNodeId || null,
                splitPortalId: null,
                childNodeIds: [],
                fieldId: leafFieldId,
                linkIds: [],
                requiredLinkIds: []
            };

            attempt.tree.nodeMap[leafNodeId] = leafNode;

            if (!parentNodeId) {
                attempt.tree.rootNodeIds.push(leafNodeId);
            } else if (attempt.tree.nodeMap[parentNodeId]) {
                attempt.tree.nodeMap[parentNodeId].childNodeIds.push(leafNodeId);
            }

            attempt.tree.leafNodeIds.push(leafNodeId);
            return leafNodeId;
        }

        var candidateOrder = forcedSplitPortalIds.length === 1
        ? forcedSplitPortalIds.slice()
        : OFP.shuffleWithRng(insideIds, attempt.rng);

        var selectedSplitPortalId = null;
        var selectedAssignment = null;
        var rejectedCandidates = [];

        for (var i = 0; i < candidateOrder.length; i += 1) {
            var candidatePortalId = candidateOrder[i];

            var assignment = OFP.assignRequiredLinksAfterSplitV2(
                attempt.plan,
                ccwTriangle,
                candidatePortalId,
                requiredLinkIdsInTriangle
            );

            if (assignment.success) {
                selectedSplitPortalId = candidatePortalId;
                selectedAssignment = assignment;
                break;
            }

            rejectedCandidates.push({
                portalId: candidatePortalId,
                failures: assignment.failures
            });

            if (forcedSplitPortalIds.length === 1) {
                break;
            }
        }

        if (!selectedSplitPortalId || !selectedAssignment) {
            OFP.addAttemptError(
                attempt,
                'NO_FEASIBLE_SPLIT_POINT_FOR_REQUIRED_LINKS',
                'No split portal can cleanly distribute the required links in this triangle.',
                {
                    triangle: ccwTriangle,
                    level: level,
                    requiredLinkIdsInTriangle: requiredLinkIdsInTriangle,
                    forcedSplitPortalIds: forcedSplitPortalIds,
                    rejectedCandidates: rejectedCandidates.slice(0, 20),
                    rejectedCandidateCount: rejectedCandidates.length
                }
            );
            return null;
        }

        var nodeId = OFP.makeRecursiveSplitNodeId(attempt);
        var fieldId = OFP.addCompletionFieldV1(attempt, ccwTriangle, parentFieldId, {
            source: 'recursiveSplitV2',
            nodeId: nodeId,
            hierarchyLevel: level
        });

        var node = {
            id: nodeId,
            triangle: ccwTriangle,
            level: level,
            parentNodeId: parentNodeId || null,
            splitPortalId: selectedSplitPortalId,
            childNodeIds: [],
            fieldId: fieldId,
            linkIds: [],
            requiredLinkIds: requiredLinkIdsInTriangle.slice()
        };

        attempt.tree.nodeMap[nodeId] = node;

        if (!parentNodeId) {
            attempt.tree.rootNodeIds.push(nodeId);
        } else if (attempt.tree.nodeMap[parentNodeId]) {
            attempt.tree.nodeMap[parentNodeId].childNodeIds.push(nodeId);
        }

        attempt.splitNodes += 1;

        ccwTriangle.forEach(function (vertexPortalId) {
            var linkId = OFP.addCompletionLinkV1(
                attempt,
                selectedSplitPortalId,
                vertexPortalId,
                'recursiveSplitV2',
                {
                    role: 'split_link',
                    hierarchyLevel: level + 1,
                    nodeId: nodeId,
                    splitPortalId: selectedSplitPortalId
                }
            );

            if (linkId) {
                node.linkIds.push(linkId);
            }
        });

        var remainingCandidateIds = insideIds.filter(function (portalId) {
            return portalId !== selectedSplitPortalId;
        });

        var childOrder = [0, 1, 2];

        if (forcedSplitPortalIds.length !== 1) {
            childOrder = OFP.shuffleWithRng(childOrder, attempt.rng);
        }

        childOrder.forEach(function (childIndex) {
            var childTriangle = selectedAssignment.childTriangles[childIndex];
            var childRequiredLinkIds = selectedAssignment.childRequiredLinkIds[childIndex].slice().sort();
            var childCandidateIds = OFP.getCleanChildCandidateIdsV2(
                attempt.plan,
                childTriangle,
                remainingCandidateIds
            );

            OFP.completeTriangleRecursiveV2(
                attempt,
                childTriangle,
                childCandidateIds,
                childRequiredLinkIds,
                nodeId,
                fieldId,
                level + 1
            );
        });

        return nodeId;
    };

    OFP.assignRequiredLinksToRootTrianglesV2 = function assignRequiredLinksToRootTrianglesV2(
    plan,
     hullTriangulation,
     completedLinkSet
    ) {
        return OFP.assignRequiredLinksToTrianglesCleanly(
            plan,
            plan.requiredLinkIds.slice().sort(),
            hullTriangulation.triangles,
            completedLinkSet
        );
    };

    OFP.runCompletionAttemptV2 = function runCompletionAttemptV2(
    plan,
     options,
     requiredLinkGeometryReport,
     attemptIndex
    ) {
        var attempt = OFP.makeCompletionAttemptStateV2(plan, options, attemptIndex);

        if (plan.diagnostics.errors.length > 0) {
            OFP.addAttemptError(attempt, 'PLAN_HAS_ERRORS', 'Completion was skipped because the Plan has errors.', {
                planErrors: plan.diagnostics.errors.length
            });
            return attempt;
        }

        if (!requiredLinkGeometryReport || !requiredLinkGeometryReport.isValid) {
            OFP.addAttemptError(
                attempt,
                'REQUIRED_LINK_GEOMETRY_INVALID',
                'Completion was skipped because required link geometry is invalid.',
                {
                    geometryErrors: requiredLinkGeometryReport ? requiredLinkGeometryReport.errors.length : null
                }
            );
            return attempt;
        }

        if (plan.workingView.hull.length < 3) {
            OFP.addAttemptError(attempt, 'HULL_TOO_SMALL', 'Completion requires at least three hull portals.', {
                hullPortals: plan.workingView.hull.length
            });
            return attempt;
        }

        var hullTriangulation = OFP.buildRequiredLinkAwareHullTriangulationV2(
            attempt.plan,
            attempt.rng
        );

        attempt.rootInfo = {
            rootPortalId: hullTriangulation.rootPortalId,
            mode: hullTriangulation.mode,
            triangleCount: hullTriangulation.triangles.length,
            diagonalCount: hullTriangulation.diagonalLinkIds.length,
            diagonalLinkIds: hullTriangulation.diagonalLinkIds.slice(),
            requiredHullDiagonalIds: hullTriangulation.requiredHullDiagonalIds.slice()
        };

        if (!hullTriangulation.success) {
            OFP.addAttemptError(
                attempt,
                'REQUIRED_LINK_AWARE_HULL_TRIANGULATION_FAILED',
                'Required-link-aware hull triangulation failed.',
                {
                    hullTriangulationErrors: hullTriangulation.errors,
                    requiredHullDiagonalIds: hullTriangulation.requiredHullDiagonalIds,
                    hullPortalIds: hullTriangulation.metadata.hullPortalIds
                }
            );
            return attempt;
        }

        var hullEdgeLinkIds = OFP.getHullEdgeLinkIdsByPortalIds(attempt.plan);

        hullEdgeLinkIds.forEach(function (linkId) {
            var parts = linkId.split('-');

            OFP.addCompletionLinkV1(
                attempt,
                parts[0],
                parts.slice(1).join('-'),
                'hullTriangulationV2',
                {
                    role: 'hull_edge',
                    hierarchyLevel: 0
                }
            );
        });

        hullTriangulation.diagonalLinkIds.forEach(function (linkId) {
            var endpoints = OFP.getLinkEndpointIdsForHullTriangulation(attempt.plan, linkId);

            OFP.addCompletionLinkV1(
                attempt,
                endpoints.from,
                endpoints.to,
                'hullTriangulationV2',
                {
                    role: hullTriangulation.requiredHullDiagonalIds.indexOf(linkId) >= 0
                    ? 'required_hull_diagonal'
                    : 'hull_diagonal',
                    hierarchyLevel: 0
                }
            );
        });

        var rootAssignment = OFP.assignRequiredLinksToRootTrianglesV2(
            attempt.plan,
            hullTriangulation,
            attempt.completedLinkSet
        );

        if (!rootAssignment.success) {
            OFP.addAttemptError(
                attempt,
                'REQUIRED_LINKS_CANNOT_BE_ASSIGNED_TO_ROOT_TRIANGLES',
                'Required links cannot be cleanly assigned to the root hull triangulation.',
                {
                    failures: rootAssignment.failures.slice(0, 20),
                    failureCount: rootAssignment.failures.length,
                    hullTriangulation: hullTriangulation
                }
            );
            return attempt;
        }

        var allCandidatePortalIds = attempt.plan.requiredPortalIds.slice().sort();

        var rootOrder = [];

        for (var rootIndex = 0; rootIndex < hullTriangulation.triangles.length; rootIndex += 1) {
            rootOrder.push(rootIndex);
        }

        rootOrder = OFP.shuffleWithRng(rootOrder, attempt.rng);

        rootOrder.forEach(function (rootTriangleIndex) {
            var rootTriangle = hullTriangulation.triangles[rootTriangleIndex];
            var rootRequiredLinkIds = rootAssignment.buckets[rootTriangleIndex].slice().sort();
            var rootCandidateIds = OFP.getPortalIdsStrictlyInsideTriangle(
                attempt.plan,
                rootTriangle,
                allCandidatePortalIds
            );

            OFP.completeTriangleRecursiveV2(
                attempt,
                rootTriangle,
                rootCandidateIds,
                rootRequiredLinkIds,
                null,
                null,
                0
            );
        });

        var uncoveredRequiredLinks = OFP.getUncoveredRequiredLinks(
            attempt.plan,
            attempt.completedLinkSet
        );

        if (uncoveredRequiredLinks.length > 0) {
            OFP.addAttemptError(
                attempt,
                'REQUIRED_LINKS_NOT_COVERED_IN_COMPLETION_V2',
                'Some required links are not included in the recursive completion.',
                {
                    uncoveredRequiredLinks: uncoveredRequiredLinks
                }
            );
        }

        var unusedRequiredPortals = OFP.getUnusedRequiredPortals(
            attempt.plan,
            attempt.usedPortalSet
        );

        if (unusedRequiredPortals.length > 0) {
            OFP.addAttemptError(
                attempt,
                'REQUIRED_PORTALS_NOT_USED_IN_COMPLETION_V2',
                'Some required portals were not used by any completed field.',
                {
                    unusedRequiredPortals: unusedRequiredPortals
                }
            );
        }

        var geometryErrors = OFP.validateCompletedLinkGeometryV1(attempt);

        if (geometryErrors.length > 0) {
            OFP.addAttemptError(
                attempt,
                'COMPLETED_LINK_GEOMETRY_INVALID',
                'Completed links contain a geometric conflict.',
                {
                    geometryErrors: geometryErrors.slice(0, 20),
                    geometryErrorCount: geometryErrors.length
                }
            );
        }

        var completedLinkIds = Object.keys(attempt.completedLinkSet).sort();
        var completedFieldIds = Object.keys(attempt.completedFieldSet).sort();

        attempt.plan.completionStructure = {
            hullPortalIds: attempt.plan.workingView.hull.map(function (pointIndex) {
                return OFP.getWorkingPortalId(attempt.plan, pointIndex);
            }),
            hullTriangulation: {
                mode: hullTriangulation.mode,
                rootPortalId: hullTriangulation.rootPortalId,
                triangles: hullTriangulation.triangles.map(function (triangle) {
                    return triangle.slice();
                }),
                diagonalLinkIds: hullTriangulation.diagonalLinkIds.slice().sort(),
                requiredHullDiagonalIds: hullTriangulation.requiredHullDiagonalIds.slice().sort()
            },
            recursiveSplitTree: {
                rootNodeIds: attempt.tree.rootNodeIds.slice(),
                nodeMap: attempt.tree.nodeMap,
                leafNodeIds: attempt.tree.leafNodeIds.slice()
            },
            completedLinkIds: completedLinkIds,
            completedFieldIds: completedFieldIds,
            metadata: {
                timestamp: new Date().toISOString(),
                seed: options.seed,
                attemptIndex: attemptIndex,
                mode: 'recursive_apollonian_v2',
                hullTriangulationMode: hullTriangulation.mode,
                maxDepth: attempt.maxDepth,
                splitNodes: attempt.splitNodes,
                nodeCount: attempt.nodeCounter,
                leafFields: attempt.tree.leafNodeIds.length
            }
        };

        attempt.plan.metadata.counts.completedLinks = completedLinkIds.length;
        attempt.plan.metadata.counts.completedFields = completedFieldIds.length;

        return attempt;
    };

    OFP.getHullPortalIdsV2 = function getHullPortalIdsV2(plan) {
        return plan.workingView.hull.map(function (pointIndex) {
            return OFP.getWorkingPortalId(plan, pointIndex);
        });
    };

    OFP.makePortalIdSet = function makePortalIdSet(portalIds) {
        var set = {};

        portalIds.forEach(function (portalId) {
            set[portalId] = true;
        });

        return set;
    };

    OFP.getCanonicalLinkEndpointIds = function getCanonicalLinkEndpointIds(linkId) {
        var parts = String(linkId).split('-');

        return {
            from: parts[0],
            to: parts.slice(1).join('-')
        };
    };

    OFP.getLinkEndpointIdsForHullTriangulation = function getLinkEndpointIdsForHullTriangulation(plan, linkId) {
        var link = plan.linkMap[linkId];

        if (link) {
            return {
                from: link.from,
                to: link.to
            };
        }

        return OFP.getCanonicalLinkEndpointIds(linkId);
    };

    OFP.getPolygonIndexOfPortal = function getPolygonIndexOfPortal(polygonPortalIds, portalId) {
        return polygonPortalIds.indexOf(portalId);
    };

    OFP.areAdjacentInPolygon = function areAdjacentInPolygon(polygonPortalIds, portalIdA, portalIdB) {
        var n = polygonPortalIds.length;
        var indexA = OFP.getPolygonIndexOfPortal(polygonPortalIds, portalIdA);
        var indexB = OFP.getPolygonIndexOfPortal(polygonPortalIds, portalIdB);

        if (indexA < 0 || indexB < 0) return false;

        return Math.abs(indexA - indexB) === 1 ||
            Math.abs(indexA - indexB) === n - 1;
    };

    OFP.isBoundaryEdgeInPolygon = function isBoundaryEdgeInPolygon(polygonPortalIds, linkId) {
        var endpoints = OFP.getCanonicalLinkEndpointIds(linkId);

        return OFP.areAdjacentInPolygon(
            polygonPortalIds,
            endpoints.from,
            endpoints.to
        );
    };

    OFP.isInternalDiagonalInPolygon = function isInternalDiagonalInPolygon(
    polygonPortalIds,
     portalIdA,
     portalIdB
    ) {
        if (portalIdA === portalIdB) return false;

        if (OFP.getPolygonIndexOfPortal(polygonPortalIds, portalIdA) < 0) return false;
        if (OFP.getPolygonIndexOfPortal(polygonPortalIds, portalIdB) < 0) return false;

        return !OFP.areAdjacentInPolygon(polygonPortalIds, portalIdA, portalIdB);
    };

    OFP.splitPolygonByDiagonal = function splitPolygonByDiagonal(polygonPortalIds, portalIdA, portalIdB) {
        var indexA = OFP.getPolygonIndexOfPortal(polygonPortalIds, portalIdA);
        var indexB = OFP.getPolygonIndexOfPortal(polygonPortalIds, portalIdB);

        if (indexA < 0 || indexB < 0) {
            return null;
        }

        if (indexA > indexB) {
            var tmp = indexA;
            indexA = indexB;
            indexB = tmp;

            var tmpPortal = portalIdA;
            portalIdA = portalIdB;
            portalIdB = tmpPortal;
        }

        var polygonA = polygonPortalIds.slice(indexA, indexB + 1);
        var polygonB = polygonPortalIds.slice(indexB).concat(polygonPortalIds.slice(0, indexA + 1));

        if (polygonA.length < 3 || polygonB.length < 3) {
            return null;
        }

        return [polygonA, polygonB];
    };

    OFP.getAllInternalDiagonalsInPolygon = function getAllInternalDiagonalsInPolygon(polygonPortalIds) {
        var result = [];
        var n = polygonPortalIds.length;

        for (var i = 0; i < n; i += 1) {
            for (var j = i + 1; j < n; j += 1) {
                var a = polygonPortalIds[i];
                var b = polygonPortalIds[j];

                if (OFP.isInternalDiagonalInPolygon(polygonPortalIds, a, b)) {
                    result.push({
                        from: a,
                        to: b,
                        linkId: OFP.getCanonicalLinkId(a, b)
                    });
                }
            }
        }

        return result;
    };

    OFP.getRequiredHullDiagonalIdsV2 = function getRequiredHullDiagonalIdsV2(plan, hullPortalIds) {
        var hullSet = OFP.makePortalIdSet(hullPortalIds);
        var requiredHullDiagonalIds = [];

        plan.requiredLinkIds.forEach(function (linkId) {
            var endpoints = OFP.getLinkEndpointIdsForHullTriangulation(plan, linkId);

            if (!hullSet[endpoints.from] || !hullSet[endpoints.to]) {
                return;
            }

            if (OFP.isBoundaryEdgeInPolygon(hullPortalIds, linkId)) {
                return;
            }

            requiredHullDiagonalIds.push(linkId);
        });

        return requiredHullDiagonalIds.sort();
    };

    OFP.getInternalRequiredDiagonalsForPolygonV2 = function getInternalRequiredDiagonalsForPolygonV2(
    plan,
     polygonPortalIds,
     requiredHullDiagonalIds
    ) {
        return requiredHullDiagonalIds.filter(function (linkId) {
            var endpoints = OFP.getLinkEndpointIdsForHullTriangulation(plan, linkId);

            return OFP.isInternalDiagonalInPolygon(
                polygonPortalIds,
                endpoints.from,
                endpoints.to
            );
        }).sort();
    };

    OFP.triangulateHullPolygonRecursiveV2 = function triangulateHullPolygonRecursiveV2(
    plan,
     polygonPortalIds,
     requiredHullDiagonalIds,
     rng,
     context
    ) {
        if (context.errors.length > 0) return;

        if (polygonPortalIds.length < 3) {
            context.errors.push({
                code: 'HULL_POLYGON_TOO_SMALL',
                polygonPortalIds: polygonPortalIds.slice()
            });
            return;
        }

        if (polygonPortalIds.length === 3) {
            context.triangles.push(OFP.getCcwTrianglePortalIds(plan, polygonPortalIds));
            return;
        }

        var forcedDiagonals = OFP.getInternalRequiredDiagonalsForPolygonV2(
            plan,
            polygonPortalIds,
            requiredHullDiagonalIds
        );

        var selectedDiagonal = null;

        if (forcedDiagonals.length > 0) {
            var shuffledForced = OFP.shuffleWithRng(forcedDiagonals, rng);
            var selectedLinkId = shuffledForced[0];
            var endpoints = OFP.getLinkEndpointIdsForHullTriangulation(plan, selectedLinkId);

            selectedDiagonal = {
                from: endpoints.from,
                to: endpoints.to,
                linkId: selectedLinkId,
                source: 'required_hull_diagonal'
            };
        } else {
            var allDiagonals = OFP.getAllInternalDiagonalsInPolygon(polygonPortalIds);

            if (!allDiagonals.length) {
                context.errors.push({
                    code: 'NO_AVAILABLE_HULL_DIAGONAL',
                    polygonPortalIds: polygonPortalIds.slice()
                });
                return;
            }

            selectedDiagonal = OFP.randomChoice(
                OFP.shuffleWithRng(allDiagonals, rng),
                rng
            );

            selectedDiagonal.source = 'random_hull_diagonal';
        }

        var split = OFP.splitPolygonByDiagonal(
            polygonPortalIds,
            selectedDiagonal.from,
            selectedDiagonal.to
        );

        if (!split) {
            context.errors.push({
                code: 'HULL_DIAGONAL_SPLIT_FAILED',
                polygonPortalIds: polygonPortalIds.slice(),
                selectedDiagonal: selectedDiagonal
            });
            return;
        }

        context.diagonalLinkIdSet[selectedDiagonal.linkId] = true;

        OFP.triangulateHullPolygonRecursiveV2(
            plan,
            split[0],
            requiredHullDiagonalIds,
            rng,
            context
        );

        OFP.triangulateHullPolygonRecursiveV2(
            plan,
            split[1],
            requiredHullDiagonalIds,
            rng,
            context
        );
    };

    OFP.buildRequiredLinkAwareHullTriangulationV2 = function buildRequiredLinkAwareHullTriangulationV2(
    plan,
     rng
    ) {
        var hullPortalIds = OFP.getHullPortalIdsV2(plan);
        var requiredHullDiagonalIds = OFP.getRequiredHullDiagonalIdsV2(plan, hullPortalIds);

        var context = {
            triangles: [],
            diagonalLinkIdSet: {},
            errors: [],
            metadata: {
                hullPortalIds: hullPortalIds.slice(),
                requiredHullDiagonalIds: requiredHullDiagonalIds.slice()
            }
        };

        if (hullPortalIds.length < 3) {
            context.errors.push({
                code: 'HULL_TOO_SMALL_FOR_TRIANGULATION',
                hullPortalIds: hullPortalIds.slice()
            });

            return {
                success: false,
                mode: 'required_link_aware_recursive',
                rootPortalId: null,
                triangles: [],
                diagonalLinkIds: [],
                requiredHullDiagonalIds: requiredHullDiagonalIds,
                errors: context.errors,
                metadata: context.metadata
            };
        }

        OFP.triangulateHullPolygonRecursiveV2(
            plan,
            hullPortalIds,
            requiredHullDiagonalIds,
            rng,
            context
        );

        var diagonalLinkIds = Object.keys(context.diagonalLinkIdSet).sort();
        var diagonalSet = OFP.makePortalIdSet(diagonalLinkIds);
        var missingRequiredHullDiagonals = requiredHullDiagonalIds.filter(function (linkId) {
            return !diagonalSet[linkId];
        });

        if (missingRequiredHullDiagonals.length > 0) {
            context.errors.push({
                code: 'REQUIRED_HULL_DIAGONALS_NOT_INCLUDED',
                missingRequiredHullDiagonals: missingRequiredHullDiagonals
            });
        }

        return {
            success: context.errors.length === 0,
            mode: 'required_link_aware_recursive',
            rootPortalId: null,
            triangles: context.triangles,
            diagonalLinkIds: diagonalLinkIds,
            requiredHullDiagonalIds: requiredHullDiagonalIds,
            errors: context.errors,
            metadata: context.metadata
        };
    };

    OFP.completePlanV2 = function completePlanV2(plan, options, requiredLinkGeometryReport) {
        var finalResult = {
            success: false,
            errors: [],
            warnings: [],
            stats: {
                attempts: 0,
                hullPortals: plan.workingView.hull.length,
                innerPortals: plan.workingView.inner.length,
                hullEdges: 0,
                diagonals: 0,
                completedLinks: 0,
                completedFields: 0,
                requiredLinksOutsideFan: 0,
                requiredLinksUncovered: 0,
                unusedRequiredPortals: 0,
                maxDepth: 0,
                splitNodes: 0,
                leafFields: 0,
                nodeCount: 0
            },
            failureReport: null,
            attemptSummaries: [],
            metadata: {
                timestamp: new Date().toISOString(),
                seed: options.seed,
                mode: 'recursive_apollonian_v2'
            }
        };

        var lastAttempt = null;

        for (var attemptIndex = 0; attemptIndex < OFP.COMPLETION_V2_MAX_ATTEMPTS; attemptIndex += 1) {
            var attempt = OFP.runCompletionAttemptV2(
                plan,
                options,
                requiredLinkGeometryReport,
                attemptIndex
            );

            lastAttempt = attempt;
            finalResult.stats.attempts = attemptIndex + 1;

            var attemptSummary = OFP.makeCompletionAttemptSummary(attempt);
            finalResult.attemptSummaries.push(attemptSummary);

            if (attempt.errors.length === 0 && attempt.plan.completionStructure) {
                plan.linkMap = attempt.plan.linkMap;
                plan.fieldMap = attempt.plan.fieldMap;
                plan.completionStructure = attempt.plan.completionStructure;
                plan.metadata.counts.completedLinks = attempt.plan.metadata.counts.completedLinks;
                plan.metadata.counts.completedFields = attempt.plan.metadata.counts.completedFields;

                finalResult.success = true;
                finalResult.warnings = attempt.warnings.slice();

                finalResult.stats.hullEdges = OFP.getHullEdgeLinkIdsByPortalIds(plan).length;
                finalResult.stats.diagonals = plan.completionStructure.hullTriangulation.diagonalLinkIds.length;
                finalResult.stats.completedLinks = plan.completionStructure.completedLinkIds.length;
                finalResult.stats.completedFields = plan.completionStructure.completedFieldIds.length;
                finalResult.stats.maxDepth = plan.completionStructure.metadata.maxDepth;
                finalResult.stats.splitNodes = plan.completionStructure.metadata.splitNodes;
                finalResult.stats.leafFields = plan.completionStructure.metadata.leafFields;
                finalResult.stats.nodeCount = plan.completionStructure.metadata.nodeCount;
                finalResult.metadata.attemptIndex = attemptIndex;

                finalResult.failureReport = OFP.makeCompletionFailureReport(
                    finalResult.attemptSummaries,
                    attempt,
                    attemptIndex
                );

                OFP.lastCompletionFailureReport = finalResult.failureReport;
                OFP.lastCompletionAttemptSummaries = finalResult.attemptSummaries.slice();
                OFP.lastCompletionLastAttemptErrors = attempt.errors.slice();

                return finalResult;
            }
        }

        finalResult.errors.push(OFP.makeCompletionDiagnostic(
            'error',
            'COMPLETION_V2_NO_VALID_ATTEMPT',
            'No valid required-link-aware recursive completion was found within the attempt limit.',
            {
                maxAttempts: OFP.COMPLETION_V2_MAX_ATTEMPTS,
                lastAttemptErrors: lastAttempt ? lastAttempt.errors : []
            }
        ));

        if (lastAttempt) {
            finalResult.warnings = lastAttempt.warnings.slice();

            var uncovered = lastAttempt.errors.filter(function (entry) {
                return entry.code === 'REQUIRED_LINKS_NOT_COVERED_IN_COMPLETION_V2';
            });

            if (uncovered.length && uncovered[0].details && uncovered[0].details.uncoveredRequiredLinks) {
                finalResult.stats.requiredLinksUncovered = uncovered[0].details.uncoveredRequiredLinks.length;
            }

            var unused = lastAttempt.errors.filter(function (entry) {
                return entry.code === 'REQUIRED_PORTALS_NOT_USED_IN_COMPLETION_V2';
            });

            if (unused.length && unused[0].details && unused[0].details.unusedRequiredPortals) {
                finalResult.stats.unusedRequiredPortals = unused[0].details.unusedRequiredPortals.length;
            }
        }

        finalResult.failureReport = OFP.makeCompletionFailureReport(
            finalResult.attemptSummaries,
            lastAttempt,
            null
        );

        OFP.lastCompletionFailureReport = finalResult.failureReport;
        OFP.lastCompletionAttemptSummaries = finalResult.attemptSummaries.slice();
        OFP.lastCompletionLastAttemptErrors = lastAttempt && lastAttempt.errors
            ? lastAttempt.errors.slice()
        : [];

        return finalResult;
    };

    OFP.formatCompletionSummaryLines = function formatCompletionSummaryLines(completionResult) {
        var stats = completionResult.stats || {};
        var metadata = completionResult.metadata || {};

        return [
            'Completion:',
            '- success: ' + String(completionResult.success),
            '- mode: ' + String(metadata.mode),
            '- attempts: ' + String(stats.attempts || 0),
            '- hull portals: ' + String(stats.hullPortals || 0),
            '- inner portals: ' + String(stats.innerPortals || 0),
            '- hull edges: ' + String(stats.hullEdges || 0),
            '- diagonals: ' + String(stats.diagonals || 0),
            '- completed links: ' + String(stats.completedLinks || 0),
            '- completed fields: ' + String(stats.completedFields || 0),
            '- split nodes: ' + String(stats.splitNodes || 0),
            '- leaf fields: ' + String(stats.leafFields || 0),
            '- max depth: ' + String(stats.maxDepth || 0),
            '- node count: ' + String(stats.nodeCount || 0),
            '- required links uncovered: ' + String(stats.requiredLinksUncovered || 0),
            '- unused required portals: ' + String(stats.unusedRequiredPortals || 0),
            '- errors: ' + String(completionResult.errors.length),
            '- warnings: ' + String(completionResult.warnings.length),
            ''
        ].concat(
            OFP.formatCompletionFailureReportSummaryLines(completionResult.failureReport)
        );
    };

    OFP.debugCompletionStructure = function debugCompletionStructure() {
        var plan = OFP.lastPlan;
        if (!plan) return null;

        return plan.completionStructure;
    };

    OFP.debugRecursiveSplitTree = function debugRecursiveSplitTree() {
        var plan = OFP.lastPlan;

        if (!plan || !plan.completionStructure) {
            return null;
        }

        return plan.completionStructure.recursiveSplitTree || null;
    };

    OFP.debugCompletionStats = function debugCompletionStats() {
        return OFP.lastCompletionResult || null;
    };

    OFP.debugCompletionFailureReport = function debugCompletionFailureReport() {
        return OFP.lastCompletionFailureReport || null;
    };

    OFP.debugCompletionAttemptSummaries = function debugCompletionAttemptSummaries() {
        return OFP.lastCompletionAttemptSummaries || [];
    };

    OFP.debugLastAttemptErrors = function debugLastAttemptErrors() {
        return OFP.lastCompletionLastAttemptErrors || [];
    };

    OFP.debugFirstFailingTriangle = function debugFirstFailingTriangle() {
        var report = OFP.lastCompletionFailureReport;

        if (!report) return null;

        return report.firstFailingTriangle || null;
    };

    OFP.debugRequiredLinksInFailingTriangle = function debugRequiredLinksInFailingTriangle() {
        var report = OFP.lastCompletionFailureReport;

        if (!report || !report.firstFailingRequiredLinks) {
            return [];
        }

        var plan = OFP.lastPlan;

        if (!plan) {
            return report.firstFailingRequiredLinks.slice();
        }

        return report.firstFailingRequiredLinks.map(function (linkId) {
            var link = plan.linkMap[linkId];

            return {
                linkId: linkId,
                from: link ? link.from : null,
                to: link ? link.to : null,
                fromLabel: link && plan.portalMap[link.from] ? plan.portalMap[link.from].label : null,
                toLabel: link && plan.portalMap[link.to] ? plan.portalMap[link.to].label : null
            };
        });
    };

    OFP.debugCompletionMode = function debugCompletionMode() {
        var plan = OFP.lastPlan;

        if (!plan || !plan.completionStructure || !plan.completionStructure.metadata) {
            return null;
        }

        return plan.completionStructure.metadata.mode;
    };

    OFP.debugRecursiveSplitTree = function debugRecursiveSplitTree() {
        var plan = OFP.lastPlan;

        if (!plan || !plan.completionStructure) {
            return null;
        }

        return plan.completionStructure.recursiveSplitTree || null;
    };

    OFP.debugCompletionStats = function debugCompletionStats() {
        return OFP.lastCompletionResult || null;
    };

    OFP.debugHullTriangulation = function debugHullTriangulation() {
        var plan = OFP.lastPlan;

        if (!plan || !plan.completionStructure) {
            return null;
        }

        return plan.completionStructure.hullTriangulation || null;
    };

    OFP.debugRequiredHullDiagonals = function debugRequiredHullDiagonals() {
        var plan = OFP.lastPlan;

        if (!plan || !plan.completionStructure || !plan.completionStructure.hullTriangulation) {
            return [];
        }

        return plan.completionStructure.hullTriangulation.requiredHullDiagonalIds || [];
    };

    OFP.PLAN_VALIDATION_EPS = 1e-12;

    OFP.makePlanValidationDiagnostic = function makePlanValidationDiagnostic(
    level,
     code,
     message,
     details
    ) {
        return {
            level: level,
            module: 'plan_validator',
            stage: 'validate_plan',
            code: code,
            message: message,
            details: details || null,
            timestamp: new Date().toISOString()
        };
    };

    OFP.getPlanPortalPoint = function getPlanPortalPoint(plan, portalId) {
        var portalRef = plan.portalMap[portalId];

        if (!portalRef || !portalRef.latLng) {
            return null;
        }

        return {
            portalId: portalId,
            lat: Number(portalRef.latLng.lat),
            lng: Number(portalRef.latLng.lng)
        };
    };

    OFP.planTriangleDoubleArea = function planTriangleDoubleArea(plan, portalIds) {
        var a = OFP.getPlanPortalPoint(plan, portalIds[0]);
        var b = OFP.getPlanPortalPoint(plan, portalIds[1]);
        var c = OFP.getPlanPortalPoint(plan, portalIds[2]);

        if (!a || !b || !c) {
            return null;
        }

        return Math.abs(
            (b.lng - a.lng) * (c.lat - a.lat) -
            (b.lat - a.lat) * (c.lng - a.lng)
        );
    };

    OFP.hasThreeDistinctValues = function hasThreeDistinctValues(values) {
        var seen = {};

        values.forEach(function (value) {
            seen[value] = true;
        });

        return Object.keys(seen).length === 3;
    };

    OFP.getTriangleBoundaryLinkIds = function getTriangleBoundaryLinkIds(vertices) {
        return [
            OFP.getCanonicalLinkId(vertices[0], vertices[1]),
            OFP.getCanonicalLinkId(vertices[1], vertices[2]),
            OFP.getCanonicalLinkId(vertices[2], vertices[0])
        ];
    };

    OFP.validatePlanLinkReference = function validatePlanLinkReference(plan, linkId, report, context) {
        var link = plan.linkMap[linkId];

        if (!link) {
            report.stats.missingLinks += 1;
            report.errors.push(OFP.makePlanValidationDiagnostic(
                'error',
                'LINK_REFERENCE_MISSING',
                'A link id is referenced but missing from linkMap.',
                {
                    linkId: linkId,
                    context: context || null
                }
            ));
            return;
        }

        if (!plan.portalMap[link.from] || !plan.portalMap[link.to]) {
            report.stats.missingLinkEndpoints += 1;
            report.errors.push(OFP.makePlanValidationDiagnostic(
                'error',
                'LINK_ENDPOINT_MISSING',
                'A link endpoint is missing from portalMap.',
                {
                    linkId: linkId,
                    from: link.from,
                    to: link.to,
                    context: context || null
                }
            ));
        }
    };

    OFP.validatePlanFieldReference = function validatePlanFieldReference(plan, fieldId, report, context) {
        var field = plan.fieldMap[fieldId];

        if (!field) {
            report.stats.missingFields += 1;
            report.errors.push(OFP.makePlanValidationDiagnostic(
                'error',
                'FIELD_REFERENCE_MISSING',
                'A field id is referenced but missing from fieldMap.',
                {
                    fieldId: fieldId,
                    context: context || null
                }
            ));
            return;
        }

        if (!Array.isArray(field.vertices) || field.vertices.length !== 3) {
            report.stats.invalidFields += 1;
            report.errors.push(OFP.makePlanValidationDiagnostic(
                'error',
                'FIELD_VERTICES_INVALID',
                'A field must have exactly three vertices.',
                {
                    fieldId: fieldId,
                    vertices: field.vertices,
                    context: context || null
                }
            ));
            return;
        }

        if (!OFP.hasThreeDistinctValues(field.vertices)) {
            report.stats.invalidFields += 1;
            report.errors.push(OFP.makePlanValidationDiagnostic(
                'error',
                'FIELD_VERTICES_NOT_DISTINCT',
                'A field has repeated vertices.',
                {
                    fieldId: fieldId,
                    vertices: field.vertices,
                    context: context || null
                }
            ));
            return;
        }

        field.vertices.forEach(function (portalId) {
            if (!plan.portalMap[portalId]) {
                report.stats.missingFieldVertices += 1;
                report.errors.push(OFP.makePlanValidationDiagnostic(
                    'error',
                    'FIELD_VERTEX_MISSING',
                    'A field vertex is missing from portalMap.',
                    {
                        fieldId: fieldId,
                        portalId: portalId,
                        context: context || null
                    }
                ));
            }
        });

        var doubleArea = OFP.planTriangleDoubleArea(plan, field.vertices);

        if (doubleArea === null || doubleArea <= OFP.PLAN_VALIDATION_EPS) {
            report.stats.degenerateFields += 1;
            report.errors.push(OFP.makePlanValidationDiagnostic(
                'error',
                'FIELD_DEGENERATE',
                'A completed field is degenerate.',
                {
                    fieldId: fieldId,
                    vertices: field.vertices,
                    doubleArea: doubleArea,
                    context: context || null
                }
            ));
            return;
        }

        var boundaryLinkIds = OFP.getTriangleBoundaryLinkIds(field.vertices);

        boundaryLinkIds.forEach(function (linkId) {
            if (!plan.linkMap[linkId]) {
                report.stats.missingFieldBoundaryLinks += 1;
                report.errors.push(OFP.makePlanValidationDiagnostic(
                    'error',
                    'FIELD_BOUNDARY_LINK_MISSING',
                    'A field boundary link is missing from linkMap.',
                    {
                        fieldId: fieldId,
                        linkId: linkId,
                        vertices: field.vertices,
                        context: context || null
                    }
                ));
            }
        });
    };

    OFP.validateCompletionStructureV0 = function validateCompletionStructureV0(plan, completionResult) {
        var report = {
            isValid: true,
            errors: [],
            warnings: [],
            stats: {
                completedLinks: 0,
                completedFields: 0,
                hullPortals: 0,
                triangulationTriangles: 0,

                missingLinks: 0,
                missingLinkEndpoints: 0,
                missingFields: 0,
                invalidFields: 0,
                missingFieldVertices: 0,
                degenerateFields: 0,
                missingFieldBoundaryLinks: 0,
                missingHullPortals: 0,
                missingTriangulationFields: 0,
                uncoveredRequiredLinks: 0
            },
            metadata: {
                timestamp: new Date().toISOString(),
                mode: 'plan_validation_v0'
            }
        };

        if (!completionResult || !completionResult.success) {
            report.errors.push(OFP.makePlanValidationDiagnostic(
                'error',
                'COMPLETION_NOT_SUCCESSFUL',
                'Plan validation was skipped because completion did not succeed.',
                {
                    completionErrors: completionResult ? completionResult.errors.length : null
                }
            ));
            report.isValid = false;
            return report;
        }

        if (!plan.completionStructure) {
            report.errors.push(OFP.makePlanValidationDiagnostic(
                'error',
                'COMPLETION_STRUCTURE_MISSING',
                'Plan has no completionStructure.',
                null
            ));
            report.isValid = false;
            return report;
        }

        var completionStructure = plan.completionStructure;

        report.stats.completedLinks = completionStructure.completedLinkIds.length;
        report.stats.completedFields = completionStructure.completedFieldIds.length;
        report.stats.hullPortals = completionStructure.hullPortalIds.length;

        completionStructure.hullPortalIds.forEach(function (portalId) {
            if (!plan.portalMap[portalId]) {
                report.stats.missingHullPortals += 1;
                report.errors.push(OFP.makePlanValidationDiagnostic(
                    'error',
                    'HULL_PORTAL_MISSING',
                    'A hull portal is missing from portalMap.',
                    {
                        portalId: portalId
                    }
                ));
            }
        });

        completionStructure.completedLinkIds.forEach(function (linkId) {
            OFP.validatePlanLinkReference(plan, linkId, report, {
                source: 'completionStructure.completedLinkIds'
            });
        });

        completionStructure.completedFieldIds.forEach(function (fieldId) {
            OFP.validatePlanFieldReference(plan, fieldId, report, {
                source: 'completionStructure.completedFieldIds'
            });
        });

        var triangulation = completionStructure.hullTriangulation;
        var triangles = triangulation && Array.isArray(triangulation.triangles)
        ? triangulation.triangles
        : [];

        report.stats.triangulationTriangles = triangles.length;

        var completionMode = completionStructure.metadata && completionStructure.metadata.mode;

        if (
            completionMode !== 'recursive_apollonian_v1' &&
            completionMode !== 'recursive_apollonian_v2' &&
            triangles.length !== completionStructure.completedFieldIds.length
        ) {
            report.warnings.push(OFP.makePlanValidationDiagnostic(
                'warning',
                'TRIANGLE_FIELD_COUNT_MISMATCH',
                'The number of hull triangulation triangles differs from completedFieldIds.',
                {
                    triangles: triangles.length,
                    completedFields: completionStructure.completedFieldIds.length
                }
            ));
        }

        triangles.forEach(function (vertices, triangleIndex) {
            if (!Array.isArray(vertices) || vertices.length !== 3) {
                report.errors.push(OFP.makePlanValidationDiagnostic(
                    'error',
                    'TRIANGULATION_TRIANGLE_INVALID',
                    'A hull triangulation triangle must have exactly three vertices.',
                    {
                        triangleIndex: triangleIndex,
                        vertices: vertices
                    }
                ));
                return;
            }

            var fieldId = OFP.getFieldId(vertices);

            if (!plan.fieldMap[fieldId]) {
                report.stats.missingTriangulationFields += 1;
                report.errors.push(OFP.makePlanValidationDiagnostic(
                    'error',
                    'TRIANGULATION_FIELD_MISSING',
                    'A hull triangulation triangle has no matching field in fieldMap.',
                    {
                        triangleIndex: triangleIndex,
                        fieldId: fieldId,
                        vertices: vertices
                    }
                ));
            }
        });

        var completedLinkSet = {};
        completionStructure.completedLinkIds.forEach(function (linkId) {
            completedLinkSet[linkId] = true;
        });

        plan.requiredLinkIds.forEach(function (linkId) {
            if (!completedLinkSet[linkId]) {
                report.stats.uncoveredRequiredLinks += 1;
                report.errors.push(OFP.makePlanValidationDiagnostic(
                    'error',
                    'REQUIRED_LINK_NOT_COVERED',
                    'A required link is not included in completedLinkIds.',
                    {
                        linkId: linkId
                    }
                ));
            }
        });

        if (report.errors.length > 0) {
            report.isValid = false;
        }

        return report;
    };

    OFP.formatPlanValidationSummaryLines = function formatPlanValidationSummaryLines(report) {
        return [
            'Plan validation:',
            '- is valid: ' + String(report.isValid),
            '- completed links: ' + String(report.stats.completedLinks),
            '- completed fields: ' + String(report.stats.completedFields),
            '- hull portals: ' + String(report.stats.hullPortals),
            '- triangulation triangles: ' + String(report.stats.triangulationTriangles),
            '- missing links: ' + String(report.stats.missingLinks),
            '- missing link endpoints: ' + String(report.stats.missingLinkEndpoints),
            '- missing fields: ' + String(report.stats.missingFields),
            '- invalid fields: ' + String(report.stats.invalidFields),
            '- degenerate fields: ' + String(report.stats.degenerateFields),
            '- missing field boundary links: ' + String(report.stats.missingFieldBoundaryLinks),
            '- uncovered required links: ' + String(report.stats.uncoveredRequiredLinks),
            '- errors: ' + String(report.errors.length),
            '- warnings: ' + String(report.warnings.length)
        ];
    };

    OFP.debugPlanValidation = function debugPlanValidation() {
        return OFP.lastPlanValidationReport || null;
    };

    OFP.makeDrawToolsSnapshotDiagnostic = function makeDrawToolsSnapshotDiagnostic(
    level,
     code,
     message,
     details
    ) {
        return {
            level: level,
            module: 'drawtools_snapshot',
            stage: 'snapshot_restore',
            code: code,
            message: message,
            details: details || null,
            timestamp: new Date().toISOString()
        };
    };

    OFP.getDrawToolsDrawnItemsLayer = function getDrawToolsDrawnItemsLayer() {
        if (!window.plugin || !window.plugin.drawTools) {
            throw new Error('Draw Tools is not available.');
        }

        if (!window.plugin.drawTools.drawnItems) {
            throw new Error('Draw Tools drawnItems layer is not available.');
        }

        return window.plugin.drawTools.drawnItems;
    };

    OFP.getLayerColor = function getLayerColor(layer) {
        if (layer && layer.options && layer.options.color) {
            return String(layer.options.color);
        }

        if (layer && layer.options && layer.options.fillColor) {
            return String(layer.options.fillColor);
        }

        return '#a24ac3';
    };

    OFP.clonePlainLatLng = function clonePlainLatLng(latLng) {
        return {
            lat: Number(latLng.lat),
            lng: Number(latLng.lng)
        };
    };

    OFP.getLayerLatLngPaths = function getLayerLatLngPaths(layer) {
        var rawLatLngs = null;

        if (layer && typeof layer.getLatLngs === 'function') {
            rawLatLngs = layer.getLatLngs();
        } else if (layer && layer._latlngs) {
            rawLatLngs = layer._latlngs;
        }

        if (!rawLatLngs) return [];

        var paths = [];
        OFP.collectLatLngPaths(rawLatLngs, paths);

        return paths.map(function (path) {
            return path.map(OFP.clonePlainLatLng);
        });
    };

    OFP.serializeDrawToolsLayer = function serializeDrawToolsLayer(layer, sourceIndex, diagnostics) {
        var kind = OFP.getDrawToolsLayerKind(layer);
        var color = OFP.getLayerColor(layer);

        if (kind === 'polygon') {
            var polygonPaths = OFP.getLayerLatLngPaths(layer);

            if (!polygonPaths.length) {
                diagnostics.warnings.push(OFP.makeDrawToolsSnapshotDiagnostic(
                    'warning',
                    'SNAPSHOT_POLYGON_EMPTY',
                    'A polygon layer could not be serialized because its path is empty.',
                    {
                        sourceIndex: sourceIndex,
                        typeName: OFP.getLayerTypeName(layer)
                    }
                ));

                return null;
            }

            return {
                type: 'polygon',
                latLngs: polygonPaths[0],
                extraLatLngs: polygonPaths.slice(1),
                color: color
            };
        }

        if (kind === 'polyline') {
            var polylinePaths = OFP.getLayerLatLngPaths(layer);

            if (!polylinePaths.length) {
                diagnostics.warnings.push(OFP.makeDrawToolsSnapshotDiagnostic(
                    'warning',
                    'SNAPSHOT_POLYLINE_EMPTY',
                    'A polyline layer could not be serialized because its path is empty.',
                    {
                        sourceIndex: sourceIndex,
                        typeName: OFP.getLayerTypeName(layer)
                    }
                ));

                return null;
            }

            return {
                type: 'polyline',
                latLngs: polylinePaths[0],
                extraLatLngs: polylinePaths.slice(1),
                color: color
            };
        }

        if (kind === 'marker') {
            if (!layer || typeof layer.getLatLng !== 'function') {
                diagnostics.warnings.push(OFP.makeDrawToolsSnapshotDiagnostic(
                    'warning',
                    'SNAPSHOT_MARKER_LATLNG_MISSING',
                    'A marker layer could not be serialized because getLatLng is missing.',
                    {
                        sourceIndex: sourceIndex,
                        typeName: OFP.getLayerTypeName(layer)
                    }
                ));

                return null;
            }

            return {
                type: 'marker',
                latLng: OFP.clonePlainLatLng(layer.getLatLng()),
                color: color
            };
        }

        if (kind === 'circle') {
            var center = null;
            var radius = null;

            if (layer && typeof layer.getLatLng === 'function') {
                center = OFP.clonePlainLatLng(layer.getLatLng());
            } else if (layer && layer._latlng) {
                center = OFP.clonePlainLatLng(layer._latlng);
            }

            if (layer && typeof layer.getRadius === 'function') {
                radius = Number(layer.getRadius());
            } else if (layer && typeof layer._mRadius === 'number') {
                radius = Number(layer._mRadius);
            }

            if (!center || !isFinite(radius)) {
                diagnostics.warnings.push(OFP.makeDrawToolsSnapshotDiagnostic(
                    'warning',
                    'SNAPSHOT_CIRCLE_INCOMPLETE',
                    'A circle layer could not be serialized because center or radius is missing.',
                    {
                        sourceIndex: sourceIndex,
                        typeName: OFP.getLayerTypeName(layer),
                        hasCenter: !!center,
                        radius: radius
                    }
                ));

                return null;
            }

            return {
                type: 'circle',
                latLng: center,
                radius: radius,
                color: color
            };
        }

        diagnostics.warnings.push(OFP.makeDrawToolsSnapshotDiagnostic(
            'warning',
            'SNAPSHOT_UNSUPPORTED_OBJECT',
            'An unsupported Draw Tools object was skipped during snapshot capture.',
            {
                sourceIndex: sourceIndex,
                typeName: OFP.getLayerTypeName(layer)
            }
        ));

        return null;
    };

    OFP.captureDrawToolsSnapshot = function captureDrawToolsSnapshot() {
        var drawnItems = OFP.getDrawToolsDrawnItemsLayer();

        if (typeof drawnItems.eachLayer !== 'function') {
            throw new Error('Draw Tools drawnItems does not support eachLayer.');
        }

        var diagnostics = {
            errors: [],
            warnings: []
        };

        var snapshot = {
            rawItems: [],
            timestamp: new Date().toISOString(),
            diagnostics: diagnostics,
            metadata: {
                counts: {
                    totalLayers: 0,
                    serializedItems: 0,
                    skippedItems: 0,
                    polygons: 0,
                    polylines: 0,
                    markers: 0,
                    circles: 0
                }
            }
        };

        var sourceIndex = 0;

        drawnItems.eachLayer(function (layer) {
            snapshot.metadata.counts.totalLayers += 1;

            var item = OFP.serializeDrawToolsLayer(layer, sourceIndex, diagnostics);

            if (!item) {
                snapshot.metadata.counts.skippedItems += 1;
                sourceIndex += 1;
                return;
            }

            snapshot.rawItems.push(item);
            snapshot.metadata.counts.serializedItems += 1;

            if (item.type === 'polygon') snapshot.metadata.counts.polygons += 1;
            if (item.type === 'polyline') snapshot.metadata.counts.polylines += 1;
            if (item.type === 'marker') snapshot.metadata.counts.markers += 1;
            if (item.type === 'circle') snapshot.metadata.counts.circles += 1;

            sourceIndex += 1;
        });

        return snapshot;
    };

    OFP.latLngArrayToLeaflet = function latLngArrayToLeaflet(latLngs) {
        return (latLngs || []).map(function (point) {
            return L.latLng(Number(point.lat), Number(point.lng));
        });
    };

    OFP.makeLeafletLayerFromSerializedDrawItem = function makeLeafletLayerFromSerializedDrawItem(item) {
        var color = item.color || '#a24ac3';

        if (item.type === 'polygon') {
            return L.polygon(OFP.latLngArrayToLeaflet(item.latLngs), {
                color: color,
                fill: false
            });
        }

        if (item.type === 'polyline') {
            return L.polyline(OFP.latLngArrayToLeaflet(item.latLngs), {
                color: color
            });
        }

        if (item.type === 'marker') {
            return L.marker(L.latLng(Number(item.latLng.lat), Number(item.latLng.lng)));
        }

        if (item.type === 'circle') {
            return L.circle(L.latLng(Number(item.latLng.lat), Number(item.latLng.lng)), {
                radius: Number(item.radius),
                color: color,
                fill: false
            });
        }

        throw new Error('Unsupported serialized Draw Tools item type: ' + String(item.type));
    };

    OFP.notifyDrawToolsChanged = function notifyDrawToolsChanged() {
        if (!window.plugin || !window.plugin.drawTools) return;

        var drawTools = window.plugin.drawTools;

        if (typeof drawTools.save === 'function') {
            try {
                drawTools.save();
            } catch (e) {
                // Ignore save errors here. The caller will report restore status.
            }
        }

        if (typeof drawTools.update === 'function') {
            try {
                drawTools.update();
            } catch (e2) {
                // Ignore update errors here.
            }
        }
    };

    OFP.clearDrawToolsItems = function clearDrawToolsItems() {
        var drawnItems = OFP.getDrawToolsDrawnItemsLayer();

        if (typeof drawnItems.clearLayers !== 'function') {
            throw new Error('Draw Tools drawnItems does not support clearLayers.');
        }

        drawnItems.clearLayers();
        OFP.notifyDrawToolsChanged();
    };

    OFP.restoreDrawToolsSnapshot = function restoreDrawToolsSnapshot(snapshot) {
        if (!snapshot || !Array.isArray(snapshot.rawItems)) {
            throw new Error('Invalid Draw Tools snapshot.');
        }

        var drawnItems = OFP.getDrawToolsDrawnItemsLayer();

        if (typeof drawnItems.clearLayers !== 'function') {
            throw new Error('Draw Tools drawnItems does not support clearLayers.');
        }

        if (typeof drawnItems.addLayer !== 'function') {
            throw new Error('Draw Tools drawnItems does not support addLayer.');
        }

        var diagnostics = {
            errors: [],
            warnings: []
        };

        var summary = {
            success: false,
            writtenObjectCount: 0,
            clearedObjectCount: null,
            diagnostics: diagnostics,
            metadata: {
                timestamp: new Date().toISOString(),
                sourceSnapshotTimestamp: snapshot.timestamp || null
            }
        };

        try {
            drawnItems.clearLayers();

            snapshot.rawItems.forEach(function (item, index) {
                try {
                    var layer = OFP.makeLeafletLayerFromSerializedDrawItem(item);
                    drawnItems.addLayer(layer);
                    summary.writtenObjectCount += 1;
                } catch (e) {
                    diagnostics.errors.push(OFP.makeDrawToolsSnapshotDiagnostic(
                        'error',
                        'RESTORE_ITEM_FAILED',
                        'A serialized Draw Tools item could not be restored.',
                        {
                            index: index,
                            itemType: item && item.type,
                            error: e && e.message ? e.message : String(e)
                        }
                    ));
                }
            });

            OFP.notifyDrawToolsChanged();

            summary.success = diagnostics.errors.length === 0;
            return summary;
        } catch (e2) {
            diagnostics.errors.push(OFP.makeDrawToolsSnapshotDiagnostic(
                'error',
                'RESTORE_FAILED',
                'Draw Tools snapshot restore failed.',
                {
                    error: e2 && e2.message ? e2.message : String(e2)
                }
            ));

            return summary;
        }
    };

    OFP.formatDrawToolsSnapshotSummaryLines = function formatDrawToolsSnapshotSummaryLines(snapshot) {
        if (!snapshot) {
            return [
                'Draw Tools snapshot:',
                '- available: false'
            ];
        }

        var counts = snapshot.metadata.counts;

        return [
            'Draw Tools snapshot:',
            '- available: true',
            '- total layers: ' + String(counts.totalLayers),
            '- serialized items: ' + String(counts.serializedItems),
            '- skipped items: ' + String(counts.skippedItems),
            '- polygons: ' + String(counts.polygons),
            '- polylines: ' + String(counts.polylines),
            '- markers: ' + String(counts.markers),
            '- circles: ' + String(counts.circles),
            '- warnings: ' + String(snapshot.diagnostics.warnings.length),
            '- errors: ' + String(snapshot.diagnostics.errors.length)
        ];
    };

    OFP.debugCaptureDrawToolsSnapshot = function debugCaptureDrawToolsSnapshot() {
        var snapshot = OFP.captureDrawToolsSnapshot();
        OFP.lastDebugDrawToolsSnapshot = snapshot;
        return snapshot;
    };

    OFP.debugRestoreLastDrawToolsSnapshot = function debugRestoreLastDrawToolsSnapshot() {
        if (!OFP.lastDebugDrawToolsSnapshot) {
            throw new Error('No debug Draw Tools snapshot is available.');
        }

        return OFP.restoreDrawToolsSnapshot(OFP.lastDebugDrawToolsSnapshot);
    };

    OFP.ORION_OWNER_CLASSES = ['owner0', 'owner1', 'owner2'];
    OFP.ORION_ASSIGNMENT_MAX_STEPS = 200000;

    OFP.makeOrionDiagnostic = function makeOrionDiagnostic(level, code, message, details) {
        return {
            level: level,
            module: 'orion_assignment',
            stage: 'assign_orion',
            code: code,
            message: message,
            details: details || null,
            timestamp: new Date().toISOString()
        };
    };

    OFP.makeOrionAssignmentResult = function makeOrionAssignmentResult(options) {
        return {
            success: false,
            linkOwnerMap: {},
            ownerLinkIds: {
                owner0: [],
                owner1: [],
                owner2: []
            },
            fieldOwnerTriples: {},
            diagnostics: {
                errors: [],
                warnings: []
            },
            stats: {
                completedLinks: 0,
                completedFields: 0,
                assignedLinks: 0,
                assignedFields: 0,
                hullTriangles: 0,
                recursiveNodes: 0,
                backtrackSteps: 0
            },
            metadata: {
                seed: options.seed,
                mode: 'orion_assignment_v1',
                timestamp: new Date().toISOString()
            }
        };
    };

    OFP.getTriangleEdgeIds = function getTriangleEdgeIds(vertices) {
        return [
            OFP.getCanonicalLinkId(vertices[0], vertices[1]),
            OFP.getCanonicalLinkId(vertices[1], vertices[2]),
            OFP.getCanonicalLinkId(vertices[2], vertices[0])
        ];
    };

    OFP.getOwnerPermutationList = function getOwnerPermutationList() {
        return [
            ['owner0', 'owner1', 'owner2'],
            ['owner0', 'owner2', 'owner1'],
            ['owner1', 'owner0', 'owner2'],
            ['owner1', 'owner2', 'owner0'],
            ['owner2', 'owner0', 'owner1'],
            ['owner2', 'owner1', 'owner0']
        ];
    };

    OFP.assignOrionOwner = function assignOrionOwner(plan, result, linkId, owner, context) {
        if (OFP.ORION_OWNER_CLASSES.indexOf(owner) < 0) {
            result.diagnostics.errors.push(OFP.makeOrionDiagnostic(
                'error',
                'ORION_OWNER_INVALID',
                'An invalid Orion owner class was used.',
                {
                    linkId: linkId,
                    owner: owner,
                    context: context || null
                }
            ));
            return false;
        }

        if (!plan.linkMap[linkId]) {
            result.diagnostics.errors.push(OFP.makeOrionDiagnostic(
                'error',
                'ORION_LINK_MISSING',
                'A link required for Orion assignment is missing from linkMap.',
                {
                    linkId: linkId,
                    owner: owner,
                    context: context || null
                }
            ));
            return false;
        }

        if (result.linkOwnerMap[linkId] && result.linkOwnerMap[linkId] !== owner) {
            result.diagnostics.errors.push(OFP.makeOrionDiagnostic(
                'error',
                'ORION_OWNER_CONFLICT',
                'A link was assigned two different Orion owner classes.',
                {
                    linkId: linkId,
                    existingOwner: result.linkOwnerMap[linkId],
                    newOwner: owner,
                    context: context || null
                }
            ));
            return false;
        }

        result.linkOwnerMap[linkId] = owner;

        if (!plan.linkMap[linkId].metadata) {
            plan.linkMap[linkId].metadata = {};
        }

        plan.linkMap[linkId].metadata.orionOwner = owner;
        plan.linkMap[linkId].assignedAgent = owner;

        return true;
    };

    OFP.getTriangleAssignedOwnerSet = function getTriangleAssignedOwnerSet(edgeIds, ownerMap) {
        var set = {};
        var duplicate = false;

        edgeIds.forEach(function (edgeId) {
            var owner = ownerMap[edgeId];

            if (!owner) return;

            if (set[owner]) {
                duplicate = true;
            }

            set[owner] = true;
        });

        return {
            set: set,
            duplicate: duplicate
        };
    };

    OFP.makeHullTriangleOwnerChoices = function makeHullTriangleOwnerChoices(edgeIds, ownerMap, rng) {
        var assignedOwnerInfo = OFP.getTriangleAssignedOwnerSet(edgeIds, ownerMap);

        if (assignedOwnerInfo.duplicate) {
            return [];
        }

        var assignedOwners = assignedOwnerInfo.set;
        var unassignedEdgeIds = edgeIds.filter(function (edgeId) {
            return !ownerMap[edgeId];
        });

        var remainingOwners = OFP.ORION_OWNER_CLASSES.filter(function (owner) {
            return !assignedOwners[owner];
        });

        if (remainingOwners.length !== unassignedEdgeIds.length) {
            return [];
        }

        if (unassignedEdgeIds.length === 0) {
            return [
                {
                    assignments: []
                }
            ];
        }

        var choices = [];

        OFP.getOwnerPermutationList().forEach(function (permutation) {
            var available = permutation.filter(function (owner) {
                return remainingOwners.indexOf(owner) >= 0;
            });

            if (available.length !== remainingOwners.length) return;

            var assignments = [];

            for (var i = 0; i < unassignedEdgeIds.length; i += 1) {
                assignments.push({
                    linkId: unassignedEdgeIds[i],
                    owner: available[i]
                });
            }

            choices.push({
                assignments: assignments
            });
        });

        return OFP.shuffleWithRng(choices, rng);
    };

    OFP.makeHullAssignmentTriangleInfos = function makeHullAssignmentTriangleInfos(plan) {
        var hullTriangulation = plan.completionStructure && plan.completionStructure.hullTriangulation;
        var triangles = hullTriangulation && Array.isArray(hullTriangulation.triangles)
        ? hullTriangulation.triangles
        : [];

        return triangles.map(function (triangle, index) {
            return {
                index: index,
                vertices: triangle.slice(),
                edgeIds: OFP.getTriangleEdgeIds(triangle)
            };
        });
    };

    OFP.chooseNextHullTriangleForAssignment = function chooseNextHullTriangleForAssignment(
    triangleInfos,
     processed,
     ownerMap,
     rng
    ) {
        var candidates = [];

        triangleInfos.forEach(function (info) {
            if (processed[info.index]) return;

            var assignedCount = info.edgeIds.filter(function (edgeId) {
                return !!ownerMap[edgeId];
            }).length;

            candidates.push({
                info: info,
                assignedCount: assignedCount
            });
        });

        if (!candidates.length) return null;

        var maxAssigned = Math.max.apply(null, candidates.map(function (entry) {
            return entry.assignedCount;
        }));

        var best = candidates.filter(function (entry) {
            return entry.assignedCount === maxAssigned;
        });

        best = OFP.shuffleWithRng(best, rng);

        return best[0].info;
    };

    OFP.cloneOwnerMap = function cloneOwnerMap(ownerMap) {
        var cloned = {};

        Object.keys(ownerMap).forEach(function (key) {
            cloned[key] = ownerMap[key];
        });

        return cloned;
    };

    OFP.cloneProcessedTriangleMap = function cloneProcessedTriangleMap(processed) {
        var cloned = {};

        Object.keys(processed).forEach(function (key) {
            cloned[key] = processed[key];
        });

        return cloned;
    };

    OFP.searchHullOrionAssignment = function searchHullOrionAssignment(plan, options, result) {
        var triangleInfos = OFP.makeHullAssignmentTriangleInfos(plan);
        var rng = OFP.makeSeededRng(String(options.seed) + '#orion-hull');
        var initialOwnerMap = {};
        var initialProcessed = {};

        result.stats.hullTriangles = triangleInfos.length;

        if (!triangleInfos.length) {
            result.diagnostics.errors.push(OFP.makeOrionDiagnostic(
                'error',
                'ORION_HULL_TRIANGLES_MISSING',
                'No hull triangulation triangles are available for Orion assignment.',
                null
            ));
            return null;
        }

        var recurse = function recurse(ownerMap, processed) {
            result.stats.backtrackSteps += 1;

            if (result.stats.backtrackSteps > OFP.ORION_ASSIGNMENT_MAX_STEPS) {
                result.diagnostics.errors.push(OFP.makeOrionDiagnostic(
                    'error',
                    'ORION_ASSIGNMENT_STEP_LIMIT_EXCEEDED',
                    'Orion hull assignment exceeded the search step limit.',
                    {
                        maxSteps: OFP.ORION_ASSIGNMENT_MAX_STEPS
                    }
                ));
                return null;
            }

            var nextInfo = OFP.chooseNextHullTriangleForAssignment(
                triangleInfos,
                processed,
                ownerMap,
                rng
            );

            if (!nextInfo) {
                return ownerMap;
            }

            var choices = OFP.makeHullTriangleOwnerChoices(
                nextInfo.edgeIds,
                ownerMap,
                rng
            );

            for (var i = 0; i < choices.length; i += 1) {
                var nextOwnerMap = OFP.cloneOwnerMap(ownerMap);
                var nextProcessed = OFP.cloneProcessedTriangleMap(processed);

                var ok = true;

                choices[i].assignments.forEach(function (assignment) {
                    if (nextOwnerMap[assignment.linkId] &&
                        nextOwnerMap[assignment.linkId] !== assignment.owner) {
                        ok = false;
                        return;
                    }

                    nextOwnerMap[assignment.linkId] = assignment.owner;
                });

                if (!ok) continue;

                nextProcessed[nextInfo.index] = true;

                var solved = recurse(nextOwnerMap, nextProcessed);

                if (solved) {
                    return solved;
                }
            }

            return null;
        };

        var solvedOwnerMap = recurse(initialOwnerMap, initialProcessed);

        if (!solvedOwnerMap) {
            if (!result.diagnostics.errors.length) {
                result.diagnostics.errors.push(OFP.makeOrionDiagnostic(
                    'error',
                    'ORION_HULL_ASSIGNMENT_NOT_FOUND',
                    'No valid Orion assignment was found for the hull triangulation.',
                    {
                        hullTriangles: triangleInfos.length
                    }
                ));
            }

            return null;
        }

        return solvedOwnerMap;
    };

    OFP.getOppositeBoundaryEdgeId = function getOppositeBoundaryEdgeId(triangle, vertexPortalId) {
        var others = triangle.filter(function (portalId) {
            return portalId !== vertexPortalId;
        });

        if (others.length !== 2) return null;

        return OFP.getCanonicalLinkId(others[0], others[1]);
    };

    OFP.propagateOrionAssignmentAtNode = function propagateOrionAssignmentAtNode(
    plan,
     result,
     nodeId
    ) {
        var tree = plan.completionStructure && plan.completionStructure.recursiveSplitTree;
        var node = tree && tree.nodeMap ? tree.nodeMap[nodeId] : null;

        if (!node) {
            result.diagnostics.errors.push(OFP.makeOrionDiagnostic(
                'error',
                'ORION_RECURSIVE_NODE_MISSING',
                'A recursive split node is missing.',
                {
                    nodeId: nodeId
                }
            ));
            return false;
        }

        result.stats.recursiveNodes += 1;

        var triangle = node.triangle.slice();
        var triangleEdgeIds = OFP.getTriangleEdgeIds(triangle);

        var owners = triangleEdgeIds.map(function (edgeId) {
            return result.linkOwnerMap[edgeId];
        });

        if (owners[0] === owners[1] || owners[1] === owners[2] || owners[2] === owners[0]) {
            result.diagnostics.errors.push(OFP.makeOrionDiagnostic(
                'error',
                'ORION_NODE_BOUNDARY_NOT_TRICOLORED',
                'A recursive node boundary is not tricolored.',
                {
                    nodeId: nodeId,
                    triangle: triangle,
                    edgeIds: triangleEdgeIds,
                    owners: owners
                }
            ));
            return false;
        }

        if (!node.splitPortalId) {
            return true;
        }

        var splitPortalId = node.splitPortalId;

        for (var i = 0; i < triangle.length; i += 1) {
            var vertexPortalId = triangle[i];
            var oppositeEdgeId = OFP.getOppositeBoundaryEdgeId(triangle, vertexPortalId);
            var oppositeOwner = result.linkOwnerMap[oppositeEdgeId];
            var splitLinkId = OFP.getCanonicalLinkId(splitPortalId, vertexPortalId);

            if (!oppositeOwner) {
                result.diagnostics.errors.push(OFP.makeOrionDiagnostic(
                    'error',
                    'ORION_OPPOSITE_EDGE_OWNER_MISSING',
                    'The owner of an opposite edge is missing during recursive propagation.',
                    {
                        nodeId: nodeId,
                        vertexPortalId: vertexPortalId,
                        oppositeEdgeId: oppositeEdgeId,
                        splitLinkId: splitLinkId
                    }
                ));
                return false;
            }

            if (!OFP.assignOrionOwner(plan, result, splitLinkId, oppositeOwner, {
                source: 'recursive_propagation',
                nodeId: nodeId,
                splitPortalId: splitPortalId,
                vertexPortalId: vertexPortalId,
                oppositeEdgeId: oppositeEdgeId
            })) {
                return false;
            }
        }

        for (var childIndex = 0; childIndex < node.childNodeIds.length; childIndex += 1) {
            if (!OFP.propagateOrionAssignmentAtNode(
                plan,
                result,
                node.childNodeIds[childIndex]
            )) {
                return false;
            }
        }

        return true;
    };

    OFP.propagateOrionAssignmentRecursive = function propagateOrionAssignmentRecursive(plan, result) {
        var tree = plan.completionStructure && plan.completionStructure.recursiveSplitTree;

        if (!tree || !Array.isArray(tree.rootNodeIds)) {
            result.diagnostics.errors.push(OFP.makeOrionDiagnostic(
                'error',
                'ORION_RECURSIVE_SPLIT_TREE_MISSING',
                'recursiveSplitTree is missing.',
                null
            ));
            return false;
        }

        for (var i = 0; i < tree.rootNodeIds.length; i += 1) {
            if (!OFP.propagateOrionAssignmentAtNode(
                plan,
                result,
                tree.rootNodeIds[i]
            )) {
                return false;
            }
        }

        return true;
    };

    OFP.validateOrionAssignment = function validateOrionAssignment(plan, result) {
        var completedLinkIds = plan.completionStructure.completedLinkIds || [];
        var completedFieldIds = plan.completionStructure.completedFieldIds || [];

        result.stats.completedLinks = completedLinkIds.length;
        result.stats.completedFields = completedFieldIds.length;

        completedLinkIds.forEach(function (linkId) {
            if (!result.linkOwnerMap[linkId]) {
                result.diagnostics.errors.push(OFP.makeOrionDiagnostic(
                    'error',
                    'ORION_COMPLETED_LINK_UNASSIGNED',
                    'A completed link has no Orion owner.',
                    {
                        linkId: linkId
                    }
                ));
            }
        });

        completedFieldIds.forEach(function (fieldId) {
            var field = plan.fieldMap[fieldId];

            if (!field || !Array.isArray(field.vertices) || field.vertices.length !== 3) {
                result.diagnostics.errors.push(OFP.makeOrionDiagnostic(
                    'error',
                    'ORION_FIELD_INVALID',
                    'A completed field is invalid for Orion validation.',
                    {
                        fieldId: fieldId
                    }
                ));
                return;
            }

            var edgeIds = OFP.getTriangleEdgeIds(field.vertices);
            var owners = edgeIds.map(function (edgeId) {
                return result.linkOwnerMap[edgeId];
            });

            if (!owners[0] || !owners[1] || !owners[2]) {
                result.diagnostics.errors.push(OFP.makeOrionDiagnostic(
                    'error',
                    'ORION_FIELD_EDGE_UNASSIGNED',
                    'A completed field has an unassigned edge.',
                    {
                        fieldId: fieldId,
                        edgeIds: edgeIds,
                        owners: owners
                    }
                ));
                return;
            }

            if (owners[0] === owners[1] || owners[1] === owners[2] || owners[2] === owners[0]) {
                result.diagnostics.errors.push(OFP.makeOrionDiagnostic(
                    'error',
                    'ORION_FIELD_NOT_TRICOLORED',
                    'A completed field does not have three distinct Orion owners.',
                    {
                        fieldId: fieldId,
                        edgeIds: edgeIds,
                        owners: owners
                    }
                ));
                return;
            }

            result.fieldOwnerTriples[fieldId] = {
                edgeIds: edgeIds,
                owners: owners
            };
        });

        Object.keys(result.linkOwnerMap).forEach(function (linkId) {
            var owner = result.linkOwnerMap[linkId];

            if (!result.ownerLinkIds[owner]) {
                result.ownerLinkIds[owner] = [];
            }

            result.ownerLinkIds[owner].push(linkId);
        });

        Object.keys(result.ownerLinkIds).forEach(function (owner) {
            result.ownerLinkIds[owner].sort();
        });

        result.stats.assignedLinks = Object.keys(result.linkOwnerMap).length;
        result.stats.assignedFields = Object.keys(result.fieldOwnerTriples).length;

        return result.diagnostics.errors.length === 0;
    };

    OFP.runOrionAssignment = function runOrionAssignment(plan, options) {
        var result = OFP.makeOrionAssignmentResult(options);

        if (!plan || !plan.completionStructure) {
            result.diagnostics.errors.push(OFP.makeOrionDiagnostic(
                'error',
                'ORION_COMPLETION_STRUCTURE_MISSING',
                'Orion assignment requires a completed plan.',
                null
            ));
            return result;
        }

        var hullOwnerMap = OFP.searchHullOrionAssignment(plan, options, result);

        if (!hullOwnerMap) {
            return result;
        }

        Object.keys(hullOwnerMap).forEach(function (linkId) {
            OFP.assignOrionOwner(plan, result, linkId, hullOwnerMap[linkId], {
                source: 'hull_assignment'
            });
        });

        if (result.diagnostics.errors.length > 0) {
            return result;
        }

        OFP.propagateOrionAssignmentRecursive(plan, result);

        if (result.diagnostics.errors.length > 0) {
            return result;
        }

        result.success = OFP.validateOrionAssignment(plan, result);

        plan.orionAssignment = result;

        return result;
    };

    OFP.formatOrionAssignmentSummaryLines = function formatOrionAssignmentSummaryLines(result) {
        if (!result) {
            return [
                'Orion assignment:',
                '- enabled: false'
            ];
        }

        return [
            'Orion assignment:',
            '- enabled: true',
            '- success: ' + String(result.success),
            '- completed links: ' + String(result.stats.completedLinks),
            '- completed fields: ' + String(result.stats.completedFields),
            '- assigned links: ' + String(result.stats.assignedLinks),
            '- assigned fields: ' + String(result.stats.assignedFields),
            '- hull triangles: ' + String(result.stats.hullTriangles),
            '- recursive nodes: ' + String(result.stats.recursiveNodes),
            '- backtrack steps: ' + String(result.stats.backtrackSteps),
            '- owner0 links: ' + String(result.ownerLinkIds.owner0.length),
            '- owner1 links: ' + String(result.ownerLinkIds.owner1.length),
            '- owner2 links: ' + String(result.ownerLinkIds.owner2.length),
            '- errors: ' + String(result.diagnostics.errors.length),
            '- warnings: ' + String(result.diagnostics.warnings.length)
        ];
    };

    OFP.EXPORT_DEFAULT_COLOR = '#9e9e9e';

    OFP.HIERARCHY_COLORS = [
        '#ff6b6b',
        '#4dabf7',
        '#51cf66',
        '#ffd43b'
    ];

    OFP.ORION_OWNER_COLORS = {
        owner0: '#ff6b6b',
        owner1: '#4dabf7',
        owner2: '#51cf66'
    };

    OFP.getOrionOwnerColor = function getOrionOwnerColor(owner) {
        return OFP.ORION_OWNER_COLORS[owner] || OFP.EXPORT_DEFAULT_COLOR;
    };

    OFP.hasSuccessfulOrionAssignment = function hasSuccessfulOrionAssignment() {
        return !!(
            OFP.lastOrionAssignmentResult &&
            OFP.lastOrionAssignmentResult.success &&
            OFP.lastPlan &&
            OFP.lastPlan.orionAssignment &&
            OFP.lastPlan.orionAssignment.success
        );
    };

    OFP.validateOrionExportPreconditions = function validateOrionExportPreconditions() {
        if (!OFP.hasSuccessfulOrionAssignment()) {
            throw new Error('Orion assignment is not available. Run Complete plan with Orion assignment enabled first.');
        }
    };

    OFP.getHierarchyColor = function getHierarchyColor(level) {
        var colors = OFP.HIERARCHY_COLORS;
        var normalizedLevel = Number(level);

        if (!isFinite(normalizedLevel) || normalizedLevel < 0) {
            normalizedLevel = 0;
        }

        return colors[Math.floor(normalizedLevel) % colors.length];
    };

    OFP.makeDrawToolsExportDiagnostic = function makeDrawToolsExportDiagnostic(
    level,
     code,
     message,
     details
    ) {
        return {
            level: level,
            module: 'drawtools_export',
            stage: 'export_drawtools',
            code: code,
            message: message,
            details: details || null,
            timestamp: new Date().toISOString()
        };
    };

    OFP.requireDrawToolsPlusExport = function requireDrawToolsPlusExport() {
        if (!window.plugin || !window.plugin.drawTools) {
            throw new Error('Draw Tools is not available.');
        }

        if (!window.plugin.drawToolsPlus) {
            throw new Error('Draw Tools Plus is required for export.');
        }

        if (typeof window.plugin.drawToolsPlus.drawPolyline !== 'function') {
            throw new Error('Draw Tools Plus drawPolyline is not available.');
        }
    };

    OFP.restoreDrawToolsSnapshotUsingNativeImport = function restoreDrawToolsSnapshotUsingNativeImport(snapshot) {
        if (!snapshot || !Array.isArray(snapshot.rawItems)) {
            throw new Error('Invalid Draw Tools snapshot.');
        }

        if (!window.plugin || !window.plugin.drawTools) {
            throw new Error('Draw Tools is not available.');
        }

        if (!window.plugin.drawTools.drawnItems) {
            throw new Error('Draw Tools drawnItems layer is not available.');
        }

        if (typeof window.plugin.drawTools.import !== 'function') {
            throw new Error('Draw Tools import is not available.');
        }

        var drawnItems = window.plugin.drawTools.drawnItems;

        if (typeof drawnItems.clearLayers !== 'function') {
            throw new Error('Draw Tools drawnItems does not support clearLayers.');
        }

        drawnItems.clearLayers();
        window.plugin.drawTools.import(snapshot.rawItems);

        if (typeof window.plugin.drawTools.save === 'function') {
            window.plugin.drawTools.save();
        }

        return {
            success: true,
            restoredItems: snapshot.rawItems.length,
            metadata: {
                timestamp: new Date().toISOString(),
                sourceSnapshotTimestamp: snapshot.timestamp || null
            }
        };
    };

    OFP.getExportableCompletedLinkIds = function getExportableCompletedLinkIds(plan) {
        if (!plan || !plan.completionStructure) {
            return [];
        }

        if (!Array.isArray(plan.completionStructure.completedLinkIds)) {
            return [];
        }

        return plan.completionStructure.completedLinkIds.slice().sort();
    };

    OFP.getPlanLinkLatLngPair = function getPlanLinkLatLngPair(plan, linkId) {
        var link = plan.linkMap[linkId];

        if (!link) {
            throw new Error('Link is missing from linkMap: ' + String(linkId));
        }

        var fromPortal = plan.portalMap[link.from];
        var toPortal = plan.portalMap[link.to];

        if (!fromPortal || !fromPortal.latLng) {
            throw new Error('Link endpoint is missing from portalMap: ' + String(link.from));
        }

        if (!toPortal || !toPortal.latLng) {
            throw new Error('Link endpoint is missing from portalMap: ' + String(link.to));
        }

        return [
            L.latLng(Number(fromPortal.latLng.lat), Number(fromPortal.latLng.lng)),
            L.latLng(Number(toPortal.latLng.lat), Number(toPortal.latLng.lng))
        ];
    };

    OFP.getExportColorForLink = function getExportColorForLink(plan, linkId, options) {
        options = options || {};

        var link = plan.linkMap[linkId];

        if (!link) {
            return options.color || OFP.EXPORT_DEFAULT_COLOR;
        }

        if (options.useOrionAssignment) {
            var owner = null;

            if (link.metadata && link.metadata.orionOwner) {
                owner = link.metadata.orionOwner;
            } else if (
                plan.orionAssignment &&
                plan.orionAssignment.linkOwnerMap &&
                plan.orionAssignment.linkOwnerMap[linkId]
            ) {
                owner = plan.orionAssignment.linkOwnerMap[linkId];
            }

            return OFP.getOrionOwnerColor(owner);
        }

        if (options.useHierarchyColoring) {
            var level = 0;

            if (link.metadata && typeof link.metadata.hierarchyLevel === 'number') {
                level = link.metadata.hierarchyLevel;
            }

            return OFP.getHierarchyColor(level);
        }

        return options.color || OFP.EXPORT_DEFAULT_COLOR;
    };

    OFP.drawPlanLinkToDrawToolsPlus = function drawPlanLinkToDrawToolsPlus(plan, linkId, color) {
        var latLngPair = OFP.getPlanLinkLatLngPair(plan, linkId);

        return window.plugin.drawToolsPlus.drawPolyline(latLngPair, color);
    };

    OFP.validateExportPreconditions = function validateExportPreconditions() {
        OFP.requireDrawToolsPlusExport();

        if (!OFP.lastPlan) {
            throw new Error('No plan is available. Run Complete plan first.');
        }

        if (!OFP.lastCompletionResult || !OFP.lastCompletionResult.success) {
            throw new Error('Completion has not succeeded. Export is not available.');
        }

        if (!OFP.lastPlanValidationReport || !OFP.lastPlanValidationReport.isValid) {
            throw new Error('Plan validation has not succeeded. Export is not available.');
        }

        if (!OFP.lastPlan.completionStructure) {
            throw new Error('Plan has no completionStructure.');
        }
    };

    OFP.exportCompletionToDrawTools = function exportCompletionToDrawTools(options) {
        options = options || {};

        var mode = options.mode || 'append';
        var color = options.color || OFP.EXPORT_DEFAULT_COLOR;
        var useHierarchyColoring = !!options.useHierarchyColoring;
        var useOrionAssignment = !!options.useOrionAssignment;

        if (mode !== 'append' && mode !== 'replaceAll') {
            throw new Error('Unsupported export mode: ' + String(mode));
        }

        if (useOrionAssignment && useHierarchyColoring) {
            throw new Error('Orion assignment and hierarchy coloring cannot be used together.');
        }

        OFP.validateExportPreconditions();

        if (useOrionAssignment) {
            OFP.validateOrionExportPreconditions();
        }

        var plan = OFP.lastPlan;
        var linkIds = OFP.getExportableCompletedLinkIds(plan);

        var diagnostics = {
            errors: [],
            warnings: []
        };

        var result = {
            success: false,
            mode: mode,
            color: color,
            useHierarchyColoring: useHierarchyColoring,
            useOrionAssignment: useOrionAssignment,
            writtenLinkIds: [],
            undoSnapshotAvailable: false,
            diagnostics: diagnostics,
            metadata: {
                timestamp: new Date().toISOString(),
                linkCount: linkIds.length
            }
        };

        if (!linkIds.length) {
            diagnostics.errors.push(OFP.makeDrawToolsExportDiagnostic(
                'error',
                'NO_COMPLETED_LINKS',
                'There are no completed links to export.',
                null
            ));

            return result;
        }

        if (mode === 'replaceAll') {
            var undoSnapshot = OFP.captureDrawToolsSnapshot();

            OFP.lastExportUndoSnapshot = undoSnapshot;
            result.undoSnapshotAvailable = true;

            OFP.clearDrawToolsItems();
        }

        linkIds.forEach(function (linkId) {
            try {
                var linkColor = OFP.getExportColorForLink(plan, linkId, {
                    color: color,
                    useHierarchyColoring: useHierarchyColoring,
                    useOrionAssignment: useOrionAssignment
                });

                OFP.drawPlanLinkToDrawToolsPlus(plan, linkId, linkColor);

                result.writtenLinkIds.push(linkId);
            } catch (e) {
                diagnostics.errors.push(OFP.makeDrawToolsExportDiagnostic(
                    'error',
                    'EXPORT_LINK_FAILED',
                    'A completed link could not be exported to Draw Tools.',
                    {
                        linkId: linkId,
                        error: e && e.message ? e.message : String(e)
                    }
                ));
            }
        });

        OFP.notifyDrawToolsChanged();

        result.success = diagnostics.errors.length === 0;
        OFP.lastDrawToolsExportResult = result;

        return result;
    };

    OFP.debugOrionAssignment = function debugOrionAssignment() {
        return OFP.lastOrionAssignmentResult || null;
    };

    OFP.debugOrionLinkOwners = function debugOrionLinkOwners() {
        var result = OFP.lastOrionAssignmentResult;

        if (!result) return [];

        return Object.keys(result.linkOwnerMap).sort().map(function (linkId) {
            var owner = result.linkOwnerMap[linkId];
            var link = OFP.lastPlan && OFP.lastPlan.linkMap
            ? OFP.lastPlan.linkMap[linkId]
            : null;

            return {
                linkId: linkId,
                owner: owner,
                from: link ? link.from : null,
                to: link ? link.to : null
            };
        });
    };

    OFP.debugOrionFieldOwners = function debugOrionFieldOwners() {
        var result = OFP.lastOrionAssignmentResult;

        if (!result) return [];

        return Object.keys(result.fieldOwnerTriples).sort().map(function (fieldId) {
            return {
                fieldId: fieldId,
                edgeIds: result.fieldOwnerTriples[fieldId].edgeIds,
                owners: result.fieldOwnerTriples[fieldId].owners
            };
        });
    };

    OFP.debugRunOrionAssignment = function debugRunOrionAssignment(seed) {
        if (!OFP.lastPlan || !OFP.lastPlan.completionStructure) {
            throw new Error('No completed plan is available.');
        }

        var options = OFP.readOptions();
        if (seed) options.seed = String(seed);

        var result = OFP.runOrionAssignment(OFP.lastPlan, options);
        OFP.lastOrionAssignmentResult = result;

        return result;
    };

    OFP.debugExportCompletionAppendToDrawTools = function debugExportCompletionAppendToDrawTools(color) {
        var options = OFP.readOptions();

        return OFP.exportCompletionToDrawTools({
            mode: 'append',
            color: color || OFP.EXPORT_DEFAULT_COLOR,
            useHierarchyColoring: options.useHierarchyColoring,
            useOrionAssignment: options.useOrionAssignment
        });
    };

    OFP.debugExportCompletionReplaceAllDrawTools = function debugExportCompletionReplaceAllDrawTools(color) {
        var options = OFP.readOptions();

        return OFP.exportCompletionToDrawTools({
            mode: 'replaceAll',
            color: color || OFP.EXPORT_DEFAULT_COLOR,
            useHierarchyColoring: options.useHierarchyColoring,
            useOrionAssignment: options.useOrionAssignment
        });
    };

    OFP.debugRestoreLastExportUndoSnapshot = function debugRestoreLastExportUndoSnapshot() {
        if (!OFP.lastExportUndoSnapshot) {
            throw new Error('No export undo snapshot is available.');
        }

        return OFP.restoreDrawToolsSnapshotUsingNativeImport(OFP.lastExportUndoSnapshot);
    };

    OFP.debugLastDrawToolsExportResult = function debugLastDrawToolsExportResult() {
        return OFP.lastDrawToolsExportResult || null;
    };

    OFP.hasExportableCompletionForUI = function hasExportableCompletionForUI() {
        var options = OFP.readOptions();

        var baseReady = !!(
            OFP.lastPlan &&
            OFP.lastPlan.completionStructure &&
            OFP.lastCompletionResult &&
            OFP.lastCompletionResult.success &&
            OFP.lastPlanValidationReport &&
            OFP.lastPlanValidationReport.isValid
        );

        if (!baseReady) return false;

        if (options.useOrionAssignment) {
            return OFP.hasSuccessfulOrionAssignment();
        }

        return true;
    };

    OFP.formatDrawToolsExportSummaryLines = function formatDrawToolsExportSummaryLines(exportResult) {
        if (!exportResult) {
            return [
                'Draw Tools export:',
                '- available: false'
            ];
        }

        return [
            'Draw Tools export:',
            '- success: ' + String(exportResult.success),
            '- mode: ' + String(exportResult.mode),
            '- color: ' + String(exportResult.color),
            '- hierarchy coloring: ' + String(!!exportResult.useHierarchyColoring),
            '- orion coloring: ' + String(!!exportResult.useOrionAssignment),
            '- written links: ' + String(exportResult.writtenLinkIds.length),
            '- undo snapshot available: ' + String(exportResult.undoSnapshotAvailable),
            '- errors: ' + String(exportResult.diagnostics.errors.length),
            '- warnings: ' + String(exportResult.diagnostics.warnings.length)
        ];
    };

    OFP.formatDrawToolsRestoreSummaryLines = function formatDrawToolsRestoreSummaryLines(restoreResult) {
        if (!restoreResult) {
            return [
                'Draw Tools restore:',
                '- success: false'
            ];
        }

        return [
            'Draw Tools restore:',
            '- success: ' + String(restoreResult.success),
            '- restored items: ' + String(restoreResult.restoredItems),
            '- source snapshot timestamp: ' + String(restoreResult.metadata.sourceSnapshotTimestamp)
        ];
    };

    OFP.clearExportUndoState = function clearExportUndoState() {
        OFP.lastExportUndoSnapshot = null;
        OFP.state.canUndo = false;
    };

    OFP.handleExportPlan = function handleExportPlan() {
        if (OFP.state.uiMode === 'running') return;

        OFP.setState({
            uiMode: 'running',
            stage: 'export_drawtools',
            lastSummary: 'Exporting completed plan to Draw Tools.',
            lastError: ''
        });

        try {
            var options = OFP.readOptions();

            var exportResult = OFP.exportCompletionToDrawTools({
                mode: 'replaceAll',
                color: OFP.EXPORT_DEFAULT_COLOR,
                useHierarchyColoring: options.useHierarchyColoring,
                useOrionAssignment: options.useOrionAssignment
            });

            var errors = exportResult.diagnostics.errors;

            OFP.setState({
                uiMode: 'idle',
                stage: 'export_drawtools',
                canUndo: exportResult.success && exportResult.undoSnapshotAvailable,
                lastSummary: [
                    'Export plan completed.',
                    '',
                ].concat(
                    OFP.formatDrawToolsExportSummaryLines(exportResult),
                    [
                        '',
                        exportResult.success
                        ? 'Undo is now available.'
                        : 'Export failed. Draw Tools may be partially changed; inspect the result before retrying.'
                    ]
                ).join('\n'),
                lastError: errors.length
                ? errors.map(function (entry) {
                    return entry.message;
                }).join('\n')
                : ''
            });
        } catch (e) {
            OFP.setState({
                uiMode: 'idle',
                stage: 'export_drawtools',
                lastSummary: 'Export was not performed.',
                lastError: e && e.message ? e.message : String(e)
            });
        }
    };

    OFP.refreshPanel = function refreshPanel() {
        var statusEl = document.getElementById('ofp-status');
        var stageEl = document.getElementById('ofp-stage');
        var summaryEl = document.getElementById('ofp-summary');
        var errorEl = document.getElementById('ofp-error');

        if (statusEl) statusEl.textContent = OFP.state.uiMode;
        if (stageEl) stageEl.textContent = OFP.state.stage;
        if (summaryEl) summaryEl.textContent = OFP.state.lastSummary;
        if (errorEl) errorEl.textContent = OFP.state.lastError || '';

        var running = OFP.state.uiMode === 'running';

        var completeBtn = document.getElementById('ofp-complete-btn');
        var exportBtn = document.getElementById('ofp-export-btn');
        var undoBtn = document.getElementById('ofp-undo-btn');
        var seedInput = document.getElementById('ofp-seed-input');
        var orionInput = document.getElementById('ofp-orion-checkbox');
        var hierarchyInput = document.getElementById('ofp-hierarchy-checkbox');

        if (completeBtn) completeBtn.disabled = running;
        if (exportBtn) {
            exportBtn.disabled =
                running ||
                !OFP.hasExportableCompletionForUI();
        }
        if (undoBtn) undoBtn.disabled = running || !OFP.state.canUndo;
        if (seedInput) seedInput.disabled = running;
        if (orionInput) orionInput.disabled = running;
        if (hierarchyInput) hierarchyInput.disabled = running;
    };

    OFP.handleCompletePlan = function handleCompletePlan() {
        var options = OFP.readOptions();

        if (options.useOrionAssignment && options.useHierarchyColoring) {
            OFP.setState({
                uiMode: 'idle',
                stage: 'option_check',
                lastSeed: options.seed,
                lastSummary: 'No changes were made.',
                lastError: 'Orion assignment and hierarchy coloring cannot be enabled at the same time.'
            });
            return;
        }

        OFP.setState({
            uiMode: 'running',
            stage: 'read_drawtools',
            lastSeed: options.seed,
            lastSummary: 'Reading Draw Tools adapter input.',
            lastError: ''
        });

        try {
            var adapterResult = OFP.readDrawToolsAdapterResult();

            OFP.setState({
                uiMode: 'running',
                stage: 'read_portal_snapshot',
                lastSeed: options.seed,
                lastSummary: 'Reading Portal Snapshot.',
                lastError: ''
            });

            var portalSnapshot = OFP.readPortalSnapshot();

            OFP.setState({
                uiMode: 'running',
                stage: 'normalize',
                lastSeed: options.seed,
                lastSummary: 'Normalizing polygon, marker, and polyline input.',
                lastError: ''
            });

            var normalizationResult = OFP.normalizeRequiredPortalSet(adapterResult, portalSnapshot);

            OFP.setState({
                uiMode: 'running',
                stage: 'build_plan',
                lastSeed: options.seed,
                lastSummary: 'Building Plan and WorkingCompletionView.',
                lastError: ''
            });

            var plan = OFP.buildPlanFromNormalization(normalizationResult);

            OFP.setState({
                uiMode: 'running',
                stage: 'validate_required_links',
                lastSeed: options.seed,
                lastSummary: 'Validating required link geometry.',
                lastError: ''
            });

            var requiredLinkGeometryReport = OFP.validateRequiredLinkGeometry(plan);

            OFP.setState({
                uiMode: 'running',
                stage: 'complete',
                lastSeed: options.seed,
                lastSummary: 'Running minimal completion engine.',
                lastError: ''
            });

            var completionResult = OFP.completePlanV2(plan, options, requiredLinkGeometryReport);

            OFP.setState({
                uiMode: 'running',
                stage: 'validate_plan',
                lastSeed: options.seed,
                lastSummary: 'Validating completed plan structure.',
                lastError: ''
            });

            var planValidationReport = OFP.validateCompletionStructureV0(plan, completionResult);

            var orionAssignmentResult = null;

            if (options.useOrionAssignment &&
                completionResult.success &&
                planValidationReport.isValid) {
                OFP.setState({
                    uiMode: 'running',
                    stage: 'assign_orion',
                    lastSeed: options.seed,
                    lastSummary: 'Running Orion assignment.',
                    lastError: ''
                });

                orionAssignmentResult = OFP.runOrionAssignment(plan, options);
            }

            OFP.lastDrawToolsAdapterResult = adapterResult;
            OFP.lastPortalSnapshot = portalSnapshot;
            OFP.lastNormalizationResult = normalizationResult;
            OFP.lastPlan = plan;
            OFP.lastRequiredLinkGeometryReport = requiredLinkGeometryReport;
            OFP.lastCompletionResult = completionResult;
            OFP.lastPlanValidationReport = planValidationReport;
            OFP.lastOrionAssignmentResult = orionAssignmentResult;

            // A successful new Complete plan starts a new planning session.
            // Any previous export undo snapshot is no longer the active undo target.
            OFP.clearExportUndoState();

            var errors = []
            .concat(normalizationResult.diagnostics.errors)
            .concat(plan.diagnostics.errors)
            .concat(requiredLinkGeometryReport.errors)
            .concat(completionResult.errors)
            .concat(planValidationReport.errors)
            .concat(orionAssignmentResult ? orionAssignmentResult.diagnostics.errors : []);

            OFP.setState({
                uiMode: 'idle',
                stage: 'validate_plan',
                lastSeed: options.seed,
                lastSummary: OFP.formatCombinedPlanSummary(
                    adapterResult,
                    portalSnapshot,
                    normalizationResult,
                    plan,
                    requiredLinkGeometryReport,
                    completionResult,
                    planValidationReport,
                    orionAssignmentResult,
                    options
                ),
                lastError: errors.length
                ? errors.map(function (entry) {
                    return entry.message;
                }).join('\n')
                : ''
            });
        } catch (e) {
            OFP.setState({
                uiMode: 'idle',
                stage: OFP.state.stage || 'validate_plan',
                lastSeed: options.seed,
                lastSummary: 'No changes were made.',
                lastError: e && e.message ? e.message : String(e)
            });
        }
    };

    OFP.handleUndo = function handleUndo() {
        if (!OFP.state.canUndo) {
            OFP.setState({
                uiMode: 'idle',
                stage: 'undo',
                lastSummary: 'No undo snapshot is available.',
                lastError: ''
            });
            return;
        }

        OFP.setState({
            uiMode: 'running',
            stage: 'restore',
            lastSummary: 'Restoring Draw Tools snapshot.',
            lastError: ''
        });

        try {
            var restoreResult = OFP.debugRestoreLastExportUndoSnapshot();

            OFP.lastExportUndoSnapshot = null;

            OFP.setState({
                uiMode: 'idle',
                stage: 'restore',
                canUndo: false,
                lastSummary: [
                    'Undo completed.',
                    ''
                ].concat(
                    OFP.formatDrawToolsRestoreSummaryLines(restoreResult)
                ).join('\n'),
                lastError: ''
            });
        } catch (e) {
            OFP.setState({
                uiMode: 'idle',
                stage: 'restore',
                canUndo: true,
                lastSummary: 'Undo failed. The undo snapshot is still kept.',
                lastError: e && e.message ? e.message : String(e)
            });
        }
    };

    OFP.openPanel = function openPanel() {
        if (OFP.dlg && OFP.dlg.dialog) {
            try {
                OFP.dlg.dialog('open');
            } catch (e) {
                // Ignore dialog reopen errors.
            }
            return;
        }

        var $body = $(
            '<div id="ofp-panel-body" style="min-width: 280px;">' +
            '<div style="margin-bottom: 8px;">' +
            '<b>Orion Field Planner</b>' +
            '<div style="font-size: 11px; opacity: 0.8;">Version: <span id="ofp-version"></span></div>' +
            '</div>' +

            '<div style="margin-bottom: 8px; padding: 6px; border: 1px solid #666;">' +
            '<div><b>Status:</b> <span id="ofp-status">idle</span></div>' +
            '<div><b>Stage:</b> <span id="ofp-stage">ready</span></div>' +
            '</div>' +

            '<div style="margin-bottom: 8px;">' +
            '<label for="ofp-seed-input">RNG seed</label><br>' +
            '<input id="ofp-seed-input" type="text" style="width: 100%;" />' +
            '</div>' +

            '<div style="margin-bottom: 8px;">' +
            '<label>' +
            '<input id="ofp-orion-checkbox" type="checkbox" /> ' +
            'Orion assignment' +
            '</label><br>' +
            '<label>' +
            '<input id="ofp-hierarchy-checkbox" type="checkbox" /> ' +
            'Hierarchy coloring' +
            '</label>' +
            '</div>' +

            '<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">' +
            '<button id="ofp-complete-btn" type="button">Complete plan</button>' +
            '<button id="ofp-export-btn" type="button">Export plan</button>' +
            '<button id="ofp-undo-btn" type="button">Undo</button>' +
            '</div>' +

            '<div style="margin-bottom: 8px;">' +
            '<b>Summary</b>' +
            '<div id="ofp-summary" style="white-space: pre-wrap;"></div>' +
            '</div>' +

            '<div>' +
            '<b>Error / warning</b>' +
            '<div id="ofp-error" style="white-space: pre-wrap; color: #f66;"></div>' +
            '</div>' +
            '</div>'
        );

        OFP.dlg = dialog({
            title: 'Orion Field Planner',
            html: $body,
            id: 'ofp-panel',
            width: 320,
            closeCallback: function () {
                OFP.dlg = null;
            }
        });

        document.getElementById('ofp-version').textContent = OFP.VERSION;
        document.getElementById('ofp-seed-input').value = OFP.state.lastSeed || OFP.DEFAULT_SEED;

        $('#ofp-complete-btn').on('click', OFP.handleCompletePlan);
        $('#ofp-export-btn').on('click', OFP.handleExportPlan);
        $('#ofp-undo-btn').on('click', OFP.handleUndo);

        $('#ofp-orion-checkbox').on('change', function () {
            if (this.checked) {
                $('#ofp-hierarchy-checkbox').prop('checked', false);
            }
            OFP.refreshPanel();
        });

        $('#ofp-hierarchy-checkbox').on('change', function () {
            if (this.checked) {
                $('#ofp-orion-checkbox').prop('checked', false);
            }
            OFP.refreshPanel();
        });

        OFP.refreshPanel();
    };

    OFP.injectButton = function injectButton() {
        if (document.getElementById('ofp-open-btn')) return;

        var $button = $('<a id="ofp-open-btn" title="Orion Field Planner">Orion</a>');
        $button.on('click', OFP.openPanel);

        var $toolbox = $('#toolbox');
        if ($toolbox.length) {
            $toolbox.append($button);
        }
    };

    OFP.setup = function setup() {
        OFP.injectButton();
    };

    OFP.setup.info = plugin_info;

    window.bootPlugins = window.bootPlugins || [];
    window.bootPlugins.push(OFP.setup);

    if (window.iitcLoaded) {
        OFP.setup();
    }
}

var script = document.createElement('script');
var info = {};

if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    info.script = {
        version: GM_info.script.version,
        name: GM_info.script.name,
        description: GM_info.script.description
    };
}

script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
