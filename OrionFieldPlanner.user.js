// ==UserScript==
// @id             iitc-plugin-orion-field-planner
// @name           IITC plugin: Orion Field Planner
// @category       Misc
// @version        0.1.0
// @author         local
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

(function () {
    'use strict';

    if (typeof window.plugin === 'undefined') {
        window.plugin = function () {};
    }

    window.plugin.orionFieldPlanner = window.plugin.orionFieldPlanner || {};
    var OFP = window.plugin.orionFieldPlanner;

    OFP.VERSION = '0.1.0';
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
        var undoBtn = document.getElementById('ofp-undo-btn');
        var seedInput = document.getElementById('ofp-seed-input');
        var orionInput = document.getElementById('ofp-orion-checkbox');
        var hierarchyInput = document.getElementById('ofp-hierarchy-checkbox');

        if (completeBtn) completeBtn.disabled = running;
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
            stage: 'complete_plan',
            lastSeed: options.seed,
            lastSummary: 'Preparing complete-plan pipeline.',
            lastError: ''
        });

        // Placeholder for the V1 pipeline:
        // 1. read drawn items
        // 2. read portal snapshot
        // 3. capture draw tools snapshot
        // 4. normalize input
        // 5. complete plan
        // 6. validate plan
        // 7. optionally run Orion assignment
        // 8. export to draw tools

        OFP.setState({
            uiMode: 'idle',
            stage: 'not_implemented',
            lastSummary:
                'UI skeleton is ready. Core completion pipeline is not implemented yet. ' +
                'Seed: ' + options.seed +
                ', Orion: ' + String(options.useOrionAssignment) +
                ', Hierarchy: ' + String(options.useHierarchyColoring) + '.',
            lastError: ''
        });
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

        // Placeholder for draw tools snapshot restore.
        OFP.setState({
            uiMode: 'restored',
            stage: 'restore',
            canUndo: false,
            lastSummary: 'Undo placeholder executed. Restore logic is not implemented yet.',
            lastError: ''
        });
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

                '<div style="display: flex; gap: 6px; margin-bottom: 8px;">' +
                    '<button id="ofp-complete-btn" type="button">Complete plan</button>' +
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

    window.bootPlugins = window.bootPlugins || [];
    window.bootPlugins.push(OFP.setup);

    if (window.iitcLoaded) {
        OFP.setup();
    }
})();
