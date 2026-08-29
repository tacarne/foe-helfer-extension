/*
 * **************************************************************************************
 * Copyright (C) 2026 FoE-Helper team - All Rights Reserved
 * **************************************************************************************
 */

FoEproxy.addHandler('IgnorePlayerService', 'getIgnoreList', (data) => {
	const d = data.responseData;
	if (!d) return;

	IgnoreList.IgnoredByMe = d.ignoredPlayerIds || [];
	IgnoreList.IgnoringMe = d.ignoredByPlayerIds || [];

	if ($('#IgnoreListBox').length > 0) {
		IgnoreList.RenderContent();
	}
});

let IgnoreList = {

	IgnoredByMe: [],
	IgnoringMe: [],
	CurrentTab: 'ignoringMe',

	FoeDataCache: {},

	SortBy: 'name',
	SortDir: 1,


    /* ====================================================================== */
    /* PREMIUM FETCH SYSTEM (sans cache persistant)                           */
    /* ====================================================================== */

    Queue: [],
    ActiveRequests: 0,
    MaxParallel: 2,
    RetryDelay: 1200,
    MaxRetry: 2,


    FetchPlayer: (id, retry = 0) => {

        // déjà chargé ou en cours
        if (IgnoreList.FoeDataCache[id]) return;

        IgnoreList.FoeDataCache[id] = {
            name: null,
            guild: '',
            guildId: 0,
            pending: true
        };

        IgnoreList.Queue.push({ id, retry });

        IgnoreList.ProcessQueue();
    },


    ProcessQueue: () => {

        while (
            IgnoreList.ActiveRequests < IgnoreList.MaxParallel &&
            IgnoreList.Queue.length > 0
        ) {
            const job = IgnoreList.Queue.shift();

            IgnoreList.ActiveRequests++;

            IgnoreList.DoFetch(job.id, job.retry);
        }
    },


    DoFetch: (id, retry = 0) => {

        const world = (typeof ExtWorld !== 'undefined' && ExtWorld)
            ? ExtWorld
            : null;

        if (!world) {
            IgnoreList.ActiveRequests--;
            IgnoreList.ProcessQueue();
            return;
        }

        const url = `https://foe-data.ovh/api/world/${world}/player/${id}`;

        MainParser.sendExtMessage({
            type: 'getFromApi',
            url
        })

        .then(data => {

            if (data && data.name) {

                IgnoreList.FoeDataCache[id] = {
                    name: data.name || null,
                    guild: data.guild_name || '',
                    guildId: data.foe_id_guild || 0,
                    pending: false
                };

            } else {

                throw new Error('empty response');
            }
        })

        .catch(() => {

            if (retry < IgnoreList.MaxRetry) {

                setTimeout(() => {

                    IgnoreList.Queue.push({
                        id,
                        retry: retry + 1
                    });

                    IgnoreList.ProcessQueue();

                }, IgnoreList.RetryDelay);

                return;
            }

            IgnoreList.FoeDataCache[id] = {
                name: null,
                guild: '',
                guildId: 0,
                pending: false
            };
        })

        .finally(() => {

            IgnoreList.ActiveRequests--;

            if ($('#IgnoreListBox').length > 0) {
                IgnoreList.RenderContent();
            }

            IgnoreList.ProcessQueue();
        });
    },

	/* ====================================================================== */
	/* RESOLVE                                                                */
	/* ====================================================================== */

	ResolvePlayer: (id) => {

		const p = PlayerDict[id];

		if (p && p.PlayerName) {
			return {
				id,
				name: p.PlayerName,
				guild: p.ClanName || '',
				guildId: p.ClanId || 0,
				known: true,
				pending: false
			};
		}

		const c = IgnoreList.FoeDataCache[id];

		if (c) {
			return {
				id,
				name: c.name || ('#' + id),
				guild: c.guild || '',
				guildId: c.guildId || 0,
				known: false,
				pending: c.pending
			};
		}

		IgnoreList.FetchPlayer(id);

		return {
			id,
			name: '#' + id,
			guild: '',
			guildId: 0,
			known: false,
			pending: true
		};
	},


	/* ====================================================================== */
	/* BOX                                                                    */
	/* ====================================================================== */

	Show: () => {

		if ($('#IgnoreListBox').length > 0) {
			HTML.CloseOpenBox('IgnoreListBox');
			return;
		}

		HTML.Box({
			id: 'IgnoreListBox',
			title: i18n('Boxes.IgnoreList.Title'),
			auto_close: true,
			dragdrop: true,
			minimize: true,
			resize: true,
			active_maps: 'main'
		});

		HTML.AddCssFile('ignore-list');

		IgnoreList.RenderContent();
	},


	/* ====================================================================== */
	/* RENDER                                                                 */
	/* ====================================================================== */

	RenderContent: () => {

		const a = IgnoreList.IgnoringMe.length;
		const b = IgnoreList.IgnoredByMe.length;

		let h = [];

		h.push('<div class="tabs dark-bg"><ul class="horizontal">');

		h.push(`
			<li ${IgnoreList.CurrentTab === 'ignoringMe' ? 'class="active"' : ''}>
				<a class="il-tab" data-tab="ignoringMe">
					<span>${i18n('Boxes.IgnoreList.TabIgnoringMe')} (${a})</span>
				</a>
			</li>
		`);

		h.push(`
			<li ${IgnoreList.CurrentTab === 'ignoredByMe' ? 'class="active"' : ''}>
				<a class="il-tab" data-tab="ignoredByMe">
					<span>${i18n('Boxes.IgnoreList.TabIgnoredByMe')} (${b})</span>
				</a>
			</li>
		`);

		h.push('</ul></div>');
		h.push('<div id="il-content">');
		h.push(IgnoreList.RenderTable());
		h.push('</div>');

		$('#IgnoreListBoxBody').html(h.join(''));

		IgnoreList.BindEvents();
	},


    RenderTable: () => {

        const ids = IgnoreList.CurrentTab === 'ignoringMe'
            ? IgnoreList.IgnoringMe
            : IgnoreList.IgnoredByMe;

        if (!ids.length) {
            return `<div class="text-center" style="padding:15px">${i18n('Boxes.IgnoreList.Empty')}</div>`;
        }

        let rows = ids.map(id => IgnoreList.ResolvePlayer(id));

        rows.sort((a, b) => {

            let av = a[IgnoreList.SortBy] || '';
            let bv = b[IgnoreList.SortBy] || '';

            return av.localeCompare(bv) * IgnoreList.SortDir;
        });

        let h = [];

        h.push('<div class="il-scroll-wrapper">');
        h.push('<table class="foe-table il-table">');

        h.push(`
            <thead>
                <tr>
                    <th>#</th>
                    <th class="il-sort" data-sort="name">Joueur</th>
                    <th class="il-sort" data-sort="guild">Guilde</th>
                </tr>
            </thead>
        `);

        h.push('<tbody>');

        rows.forEach((row, i) => {

            let playerHtml = IgnoreList.GetPlayerHtml(row);
            let guildHtml = IgnoreList.GetGuildHtml(row);

            h.push(`
                <tr>
                    <td class="text-center">${i + 1}</td>
                    <td>${playerHtml}</td>
                    <td>${guildHtml}</td>
                </tr>
            `);
        });

        h.push('</tbody></table></div>');

        return h.join('');
    },

	/* ====================================================================== */
	/* LINKS                                                                  */
	/* ====================================================================== */

    GetPlayerHtml: (row) => {

        if (row.pending) {
            return `<span class="text-grey">⏳ ${row.name}</span>`;
        }

        const world = ExtWorld;

        if (row.known) {
            return MainParser.GetPlayerLink(row.id, row.name);
        }

        return `
            <a href="https://foe-data.ovh/world/${world}/player/${row.id}"
               target="_blank"
               class="il-ext-link">
               ${row.name}
            </a>
        `;
    },

    GetGuildHtml: (row) => {

        if (!row.guild) {
            return '<span class="text-grey">-</span>';
        }

        if (row.known && row.guildId) {
            return MainParser.GetGuildLink(row.guildId, row.guild);
        }

        if (row.guildId) {
/*            return `
                <a href="https://foe-data.ovh/world/${ExtWorld}/guild/${row.guildId}"
                   target="_blank"
                   class="il-ext-link">
                   ${row.guild}
                </a>
            `;*/
            return `
                <span class="text-grey">${row.guild}</span>
            `;
        }

        return row.guild;
    },

	/* ====================================================================== */
	/* EVENTS                                                                 */
	/* ====================================================================== */

	BindEvents: () => {

		$('#IgnoreListBox')

			.off('click', '.il-tab')
			.on('click', '.il-tab', function () {

				IgnoreList.CurrentTab = $(this).data('tab');
				IgnoreList.RenderContent();
			})

			.off('click', '.il-sort')
			.on('click', '.il-sort', function () {

				const s = $(this).data('sort');

				if (IgnoreList.SortBy === s) {
					IgnoreList.SortDir *= -1;
				}
				else {
					IgnoreList.SortBy = s;
					IgnoreList.SortDir = 1;
				}

				IgnoreList.RenderContent();
			})

			.off('click', '.il-open-player')
			.on('click', '.il-open-player', function (e) {

				e.preventDefault();

				const id = parseInt($(this).data('id'));

				if (!id) return;

				MainParser.SendExtMessage?.();

				FoEproxy.emitRequest({
					requestClass: 'OtherPlayerService',
					requestMethod: 'visitPlayer',
					requestData: [id]
				});
			});
	}
};