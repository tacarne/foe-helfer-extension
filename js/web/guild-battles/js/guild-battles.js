/*
 * **************************************************************************************
 * Copyright (C) 2026 FoE-Helper team - All Rights Reserved
 * You may use, distribute and modify this code under the
 * terms of the AGPL license.
 *
 * See file LICENSE.md or go to
 * https://github.com/mainIine/foe-helfer-extension/blob/master/LICENSE.md
 * for full license details.
 *
 * **************************************************************************************
 */

// Intercept getClanData (click on a guild description)
FoEproxy.addHandler('ClanService', 'getClanData', (data) => {
	const clan = data.responseData;
	if (!clan || !clan.id || !clan.members) return;

	GuildBattles.SaveSnapshot(clan);

	if ($('#GuildBattlesBox').length > 0) {
		GuildBattles.RefreshDisplay();
	}
});

let GuildBattles = {

	MAX_SNAPSHOTS: 10,
	STORAGE_KEY: 'GuildBattles_data',

	// Indices of the 2 selected columns for comparison (0 = newest)
	SelectedCols: [],

	LoadData: () => {
		try {
			return JSON.parse(localStorage.getItem(GuildBattles.STORAGE_KEY) || '{}');
		} catch (e) {
			return {};
		}
	},

	SaveData: (data) => {
		localStorage.setItem(GuildBattles.STORAGE_KEY, JSON.stringify(data));
	},

	SaveSnapshot: (clan) => {
		let data = GuildBattles.LoadData();
		const clanId = String(clan.id);

		if (!data[clanId]) {
			data[clanId] = { id: clan.id, name: clan.name, snapshots: [] };
		} else {
			data[clanId].name = clan.name;
		}

		const timestamp = Math.floor(Date.now() / 1000);
		const members = {};
		for (const m of clan.members) {
			members[String(m.player_id)] = { name: m.name, won_battles: m.won_battles || 0 };
		}

		const snapshots = data[clanId].snapshots;
		if (snapshots.length > 0 && snapshots[0].timestamp === timestamp) {
			snapshots[0].members = members;
		} else {
			snapshots.unshift({ timestamp, members });
		}

		if (snapshots.length > GuildBattles.MAX_SNAPSHOTS) {
			snapshots.length = GuildBattles.MAX_SNAPSHOTS;
		}

		GuildBattles.SaveData(data);
	},

	Show: () => {
		if ($('#GuildBattlesBox').length > 0) {
			HTML.CloseOpenBox('GuildBattlesBox');
			return;
		}

		GuildBattles.SelectedCols = [];

		HTML.Box({
			id: 'GuildBattlesBox',
			title: i18n('Boxes.GuildBattles.Title'),
			ask: i18n('Boxes.GuildBattles.HelpLink'),
			auto_close: true,
			dragdrop: true,
			minimize: true,
			resize: true,
			active_maps: 'main',
			settings: 'GuildBattles.ShowSettings()'
		});

		HTML.AddCssFile('guild-battles');
		GuildBattles.RefreshDisplay();
	},

	RefreshDisplay: () => {
		GuildBattles.SelectedCols = [];
		const data = GuildBattles.LoadData();
//		const clanIds = Object.keys(data);
        const clanIds = Object.keys(data).sort((a, b) => {
            const sa = data[a].snapshots;
            const sb = data[b].snapshots;

            const ta = (sa && sa.length > 0) ? sa[0].timestamp : 0;
            const tb = (sb && sb.length > 0) ? sb[0].timestamp : 0;

            return tb - ta; // plus récent en premier
        });

		let h = [];
		h.push('<div class="gb-toolbar dark-bg">');
		h.push('<label>' + i18n('Boxes.GuildBattles.SelectGuild') + ' </label>');
		h.push('<select id="gb-guild-select">');
		if (clanIds.length === 0) {
			h.push('<option value="">' + i18n('Boxes.GuildBattles.NoData') + '</option>');
		} else {
			for (const id of clanIds) {
				h.push('<option value="' + id + '">' + data[id].name + ' (' + data[id].snapshots.length + ')</option>');
			}
		}
		h.push('</select>');
		h.push('<button class="btn btn-slim" id="gb-export-btn">⬇ ' + i18n('Boxes.GuildBattles.Export') + '</button>');
		h.push('<button class="btn btn-slim btn-delete" id="gb-delete-btn">✕</button>');
		h.push('</div>');

		h.push('<div id="gb-copy-bar" class="gb-copy-bar dark-bg" style="display:none">');
		h.push('<span id="gb-copy-info" class="gb-copy-info"></span>');
		h.push('<button class="btn btn-slim btn-green" id="gb-copy-btn">📋 ' + i18n('Boxes.GuildBattles.CopyComparison') + '</button>');
		h.push('</div>');

		h.push('<div id="gb-table-wrapper"></div>');

		$('#GuildBattlesBoxBody').html(h.join(''));

		$('#GuildBattlesBox').off('change', '#gb-guild-select').on('change', '#gb-guild-select', function () {
			GuildBattles.SelectedCols = [];
			GuildBattles.RenderTable($(this).val());
		});

		$('#GuildBattlesBox').off('click', '#gb-export-btn').on('click', '#gb-export-btn', function () {
			const id = $('#gb-guild-select').val();
			if (id) GuildBattles.ExportJSON(id);
		});

		$('#GuildBattlesBox').off('click', '#gb-delete-btn').on('click', '#gb-delete-btn', function () {
			const id = $('#gb-guild-select').val();
			if (!id) return;
			const d = GuildBattles.LoadData();
			const name = d[id] ? d[id].name : '?';
//			if (!window.confirm(i18n('Boxes.GuildBattles.ConfirmDelete').replace('__name__', name))) return;
			let d2 = GuildBattles.LoadData();
			delete d2[id];
			GuildBattles.SaveData(d2);
			GuildBattles.RefreshDisplay();
		});

		$('#GuildBattlesBox').off('click', '#gb-copy-btn').on('click', '#gb-copy-btn', function () {
			const id = $('#gb-guild-select').val();
			if (id) GuildBattles.CopyComparison(id);
		});

		if (clanIds.length > 0) {
			GuildBattles.RenderTable(clanIds[0]);
		}
	},

	FormatDate: (ts) => {
		const d = new Date(ts * 1000);
		return String(d.getDate()).padStart(2,'0') + '/'
			+ String(d.getMonth()+1).padStart(2,'0') + ' '
			+ String(d.getHours()).padStart(2,'0') + ':'
			+ String(d.getMinutes()).padStart(2,'0') + ':'
			+ String(d.getSeconds()).padStart(2,'0');
	},

	FormatDuration: (seconds) => {
		const s = Math.abs(seconds);
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = s % 60;
		let parts = [];
		if (h > 0) parts.push(h + 'h');
		if (m > 0) parts.push(m + 'm');
		parts.push(sec + 's');
		return parts.join(' ');
	},

	OnColCheckbox: (colIndex, checked) => {
		const sel = GuildBattles.SelectedCols;

		if (checked) {
			if (sel.includes(colIndex)) return;
			sel.push(colIndex);
			// Keep only the 2 most recently checked; uncheck the oldest
			if (sel.length > 2) {
				const removed = sel.shift();
				$('#gb-col-chk-' + removed).prop('checked', false);
			}
		} else {
			const idx = sel.indexOf(colIndex);
			if (idx !== -1) sel.splice(idx, 1);
		}

		GuildBattles.UpdateCopyBar();
	},

	UpdateCopyBar: () => {
		const sel = GuildBattles.SelectedCols;
		if (sel.length === 2) {
			const clanId = $('#gb-guild-select').val();
			const data = GuildBattles.LoadData();
			const guild = data[clanId];
			if (!guild) return;

			const colA = Math.min(sel[0], sel[1]); // newer
			const colB = Math.max(sel[0], sel[1]); // older
			const tsA = guild.snapshots[colA].timestamp;
			const tsB = guild.snapshots[colB].timestamp;
			const dur = GuildBattles.FormatDuration(tsB - tsA);

			$('#gb-copy-info').html(
				'<strong>' + GuildBattles.FormatDate(tsA) + '</strong>'
				+ ' ← ' + dur + ' → '
				+ '<strong>' + GuildBattles.FormatDate(tsB) + '</strong>'
			);
			$('#gb-copy-bar').show();
		} else {
			$('#gb-copy-bar').hide();
		}
	},

	RenderTable: (clanId) => {
		const data = GuildBattles.LoadData();
		const guild = data[clanId];
		if (!guild || guild.snapshots.length === 0) {
			$('#gb-table-wrapper').html('<div class="text-center" style="padding:10px">' + i18n('Boxes.GuildBattles.NoData') + '</div>');
			$('#gb-copy-bar').hide();
			return;
		}

		const snapshots = guild.snapshots;
		const numSnaps = snapshots.length;

		const playerMap = {};
		for (const snap of snapshots) {
			for (const [pid, pdata] of Object.entries(snap.members)) {
				if (!playerMap[pid]) playerMap[pid] = pdata.name;
			}
		}

		const latestMembers = snapshots[0].members;
		const playerIds = Object.keys(playerMap).sort((a, b) => {
			const ba = latestMembers[a] ? latestMembers[a].won_battles : 0;
			const bb = latestMembers[b] ? latestMembers[b].won_battles : 0;
			return bb - ba;
		});

		let html = [];
		html.push('<div class="gb-scroll-wrapper">');
		html.push('<table class="foe-table gb-table">');
		html.push('<thead>');

		// Row 1: checkboxes
		html.push('<tr class="gb-chk-row">');
		html.push('<th class="gb-col-player"></th>');
		for (let s = 0; s < numSnaps; s++) {
			const checked = GuildBattles.SelectedCols.includes(s) ? 'checked' : '';
			html.push('<th class="gb-col-snap text-center">'
				+ '<input type="checkbox" id="gb-col-chk-' + s + '" class="gb-col-chk game-cursor" data-col="' + s + '" ' + checked + '>'
				+ '</th>');
		}
		html.push('</tr>');

		// Row 2: dates with seconds
		html.push('<tr>');
		html.push('<th class="gb-col-player">' + i18n('Boxes.GuildBattles.Player') + '</th>');
		for (let s = 0; s < numSnaps; s++) {
			const d = new Date(snapshots[s].timestamp * 1000);
			const dateStr = String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0')
				+ '<br>' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0')
				+ ':' + String(d.getSeconds()).padStart(2,'0');
			html.push('<th class="gb-col-snap text-center">' + dateStr + '</th>');
		}
		html.push('</tr>');
		html.push('</thead><tbody>');

		for (const pid of playerIds) {
			html.push('<tr>');
			html.push('<td class="gb-col-player">' + (playerMap[pid] || '-') + '</td>');

			for (let s = 0; s < numSnaps; s++) {
				const snap = snapshots[s];
				const cur = snap.members[pid] ? snap.members[pid].won_battles : null;
				const next = (s + 1 < numSnaps && snapshots[s+1].members[pid])
					? snapshots[s+1].members[pid].won_battles : null;

				let cellContent;
				if (cur === null) {
					cellContent = '<span class="text-grey">—</span>';
				} else {
					let diffHtml = '';
					if (next !== null) {
						const diff = cur - next;
						if (diff > 0) {
							diffHtml = ' <small class="gb-diff-pos">(+' + HTML.Format(diff) + ')</small>';
						} else if (diff < 0) {
							diffHtml = ' <small class="error">(' + HTML.Format(diff) + ')</small>';
						} else {
							diffHtml = ' <small class="text-grey">(=)</small>';
						}
					}
					cellContent = HTML.Format(cur) + diffHtml;
				}

				html.push('<td class="text-center">' + cellContent + '</td>');
			}
			html.push('</tr>');
		}

		html.push('</tbody></table></div>');
		$('#gb-table-wrapper').html(html.join(''));

		$('#gb-table-wrapper').off('change', '.gb-col-chk').on('change', '.gb-col-chk', function () {
			GuildBattles.OnColCheckbox(parseInt($(this).data('col')), $(this).prop('checked'));
		});

		GuildBattles.UpdateCopyBar();
	},

	CopyComparison: (clanId) => {
		const sel = GuildBattles.SelectedCols;
		if (sel.length !== 2) return;

		const data = GuildBattles.LoadData();
		const guild = data[clanId];
		if (!guild) return;

		const colA = Math.min(sel[0], sel[1]); // newer snapshot
		const colB = Math.max(sel[0], sel[1]); // older snapshot
		const snapA = guild.snapshots[colA];
		const snapB = guild.snapshots[colB];
		const dur = GuildBattles.FormatDuration(snapB.timestamp - snapA.timestamp);

		let lines = [];
		lines.push(guild.name);
		lines.push(i18n('Boxes.GuildBattles.From')     + ' : ' + GuildBattles.FormatDate(snapB.timestamp));
		lines.push(i18n('Boxes.GuildBattles.To')       + ' : ' + GuildBattles.FormatDate(snapA.timestamp));
		lines.push(i18n('Boxes.GuildBattles.Duration') + ' : ' + dur);
		lines.push('');

		// Only players with positive diff, sorted desc
		const rows = [];
		for (const [pid, pdataA] of Object.entries(snapA.members)) {
			const battlesA = pdataA.won_battles;
			const battlesB = snapB.members[pid] ? snapB.members[pid].won_battles : null;
			if (battlesB === null) continue;
			const diff = battlesA - battlesB;
			if (diff > 0) {
				rows.push({ name: pdataA.name, diff });
			}
		}
		rows.sort((a, b) => b.diff - a.diff);

		for (const row of rows) {
			lines.push(row.name + ' : +' + row.diff);
		}

		helper.str.copyToClipboardLegacy(lines.join('\n'));

		const $btn = $('#gb-copy-btn');
		$btn.addClass('btn-active');
		setTimeout(() => $btn.removeClass('btn-active'), 800);
	},

	ExportJSON: (clanId) => {
		const data = GuildBattles.LoadData();
		const guild = data[clanId];
		if (!guild) return;

		const json = JSON.stringify(guild, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'guild-battles-' + guild.name.replace(/[^a-z0-9]/gi, '_') + '.json';
		a.click();
		URL.revokeObjectURL(url);
	},

	ShowSettings: () => {}
};