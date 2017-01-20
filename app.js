define(function(require){
	var $ = require('jquery'),
		_ = require('underscore'),
		monster = require('monster'),
		chosen = require('chosen');

	var app = {
		name: 'voicemails',

		css: [ 'app' ],

		i18n: { 
			'en-US': { customCss: false }
		},

		appFlags: {
			voicemails: {
				maxRange: 31,
				defaultRange: 1
			}
		},

		requests: {},
		subscribe: {},

		load: function(callback){
			var self = this;

			self.initApp(function() {
				callback && callback(self);
			});
		},

		initApp: function(callback) {
			var self = this;

			monster.pub('auth.initApp', {
				app: self,
				callback: callback
			});
		},

		render: function(container) {
			var self = this;

			monster.ui.generateAppLayout(self, {
				menus: [
					{
						tabs: [
							{
								text: self.i18n.active().voicemails.menuTitles.receivedVMs,
								callback: self.renderReceivedVMs
							}
						]
					}
				]
			});
		},

		renderReceivedVMs: function(pArgs) {
			var self = this,
				args = pArgs || {},
				parent = args.container || $('#voicemails_app_container .app-content-wrapper');

			self.listVMBoxes(function(vmboxes) {
				var dataTemplate = {
						vmboxes: vmboxes
					},
					template = $(monster.template(self, 'received-voicemails', dataTemplate));

				self.voicemailsInitDatePicker(parent, template);

				self.bindReceivedVMs(template);

				parent
					.fadeOut(function() {
						$(this)
							.empty()
							.append(template)
							.fadeIn();
					});
			});
		},

		voicemailsInitDatePicker: function(parent, template) {
			var self = this,
				dates = monster.util.getDefaultRangeDates(self.appFlags.voicemails.defaultRange),
				fromDate = dates.from,
				toDate = dates.to;

			var optionsDatePicker = {
				container: template,
				range: self.appFlags.voicemails.maxRange
			};

			monster.ui.initRangeDatepicker(optionsDatePicker);

			template.find('#startDate').datepicker('setDate', fromDate);
			template.find('#endDate').datepicker('setDate', toDate);

			template.find('.apply-filter').on('click', function(e) {
				var vmboxId = template.find('#select_vmbox').val();

				self.displayVMList(parent, vmboxId);
			});

			template.find('.toggle-filter').on('click', function() {
				template.find('.filter-by-date').toggleClass('active');
			});
		},

		bindReceivedVMs: function(template) {
			var self = this,
				currentVM,
				$selectVMBox = template.find('#select_vmbox');

			monster.ui.tooltips(template);
			monster.ui.footable(template.find('.footable'));

			$selectVMBox.chosen({search_contains: true, width: '220px', placeholder_text_single: self.i18n.active().voicemails.receivedVMs.actionBar.selectVM.none });

			template.find('.vmboxes-list').on('click', '.box-row', function() {
				$selectVMBox.val($(this).data('id'));
				$selectVMBox.trigger("chosen:updated");
				self.displayVMList(template, $(this).data('id'));
			});

			$selectVMBox.on('change', function() {
				self.displayVMList(template, $(this).val());
			});

			template.find('#refresh_voicemails').on('click', function() {
				var vmboxId = $selectVMBox.val();

				if(vmboxId !== 'none') {
					self.displayVMList(template, vmboxId);
				}
			});

			template.find('.mark-as-link').on('click', function() {
				var folder = $(this).data('type'),
					vmboxId = $selectVMBox.val(),
					$messages = template.find('.select-message:checked'),
					messages = [];

				$messages.each(function() {
					messages.push($(this).data('media-id'));
				});

				template.find('.data-state')
						.hide();

				template.find('.loading-state')
						.show();

				self.updateFolder(vmboxId, messages, folder, function(vmbox) {
					self.displayVMList(template, vmboxId);
				});
			});

			template.find('.delete-voicemails').on('click', function() {
				var vmboxId = $selectVMBox.val(),
					$messages = template.find('.select-message:checked'),
					messages = [];

				$messages.each(function() {
					messages.push($(this).data('media-id'));
				});

				template.find('.data-state')
						.hide();

				template.find('.loading-state')
						.show();

				self.bulkRemoveMessages(vmboxId, messages, function(vmbox) {
					self.displayVMList(template, vmboxId);
				});
			});

			template.find('.move-to-vmbox').on('click', function() {
				var targetId = $(this).data('id'),
					vmboxId = $selectVMBox.val(),
					$messages = template.find('.select-message:checked'),
					messages = [];

				$messages.each(function() {
					messages.push($(this).data('media-id'));
				});

				template.find('.data-state')
						.hide();

				template.find('.loading-state')
						.show();

				self.moveVoicemailMessages(vmboxId, targetId, messages, function(vmbox) {
					self.displayVMList(template, vmboxId);
				});
			})

			template.on('click', '.play-vm', function() {
				var $row = $(this).parents('.voicemail-row'),
					$activeRows = template.find('.voicemail-row.active');

				if($row.hasClass('active') || $activeRows.length === 0) {
					var vmboxId = template.find('#select_vmbox').val(),
						mediaId = $row.data('media-id');

					template.find('table').addClass('.highlighted');
					$row.addClass('active');

					self.playVoicemail(template, vmboxId, mediaId);
				}
				else {
					self.removeOpacityLayer(template);
				}
			});

			template.on('click', '.details-vm', function() {
				var $row = $(this).parents('.voicemail-row'),
					callId = $row.data('call-id');

				self.getCDR(callId, function(cdr) {
					var template = $(monster.template(self, 'voicemails-CDRDialog'));

					monster.ui.renderJSON(cdr, template.find('#jsoneditor'));

					monster.ui.dialog(template, { title: self.i18n.active().voicemails.receivedVMs.CDRPopup.title });
				}, function() {
					monster.ui.alert(self.i18n.active().voicemails.receivedVMs.noCDR);
				});
			});

			template.on('click', '.voicemail-row', function(e) {
				var $table = template.find('table'),
					$clickedRow = $(this);

				if($table.hasClass('highlighted') && !$clickedRow.hasClass('active')) {
					self.removeOpacityLayer(template)
				}
			});

			function afterSelect() {
				if(template.find('.select-message:checked').length) {
					template.find('.hidable').removeClass('hidden');
					template.find('.main-select-message').prop('checked', true);
				}
				else{
					template.find('.hidable').addClass('hidden');
					template.find('.main-select-message').prop('checked', false);
				}
			}

			template.on('click', '.select-message', function() {
				afterSelect();
			});

			template.find('.main-select-message').on('click', function() {
				var $this = $(this),
					isChecked = $this.prop('checked');

				template.find('.select-message').prop('checked', isChecked);

				afterSelect();
			});

			template.find('.select-some-messages').on('click', function() {
				var $this = $(this),
					type = $this.data('type');

				template.find('.select-message').prop('checked', false);

				if(type !== 'none') {
					if(type === 'all') {
						template.find('.select-message').prop('checked', true);
					}
					else if(['new','saved','deleted'].indexOf(type) >= 0) {
						template.find('.voicemail-row[data-folder="'+ type +'"] .select-message').prop('checked', true);
					}
				}

				afterSelect();
			});

			template.on('click', '.select-line', function() {
				var cb = $(this).parents('.voicemail-row').find('.select-message');

				cb.prop('checked',!cb.prop('checked'));
				afterSelect();
			});
		},

		removeOpacityLayer: function(template) {
			var $activeRows = template.find('.voicemail-row.active'),
				$table = template.find('table');

			$activeRows.find('.voicemail-player').remove();
			$activeRows.find('.duration, .actions').show();
			$activeRows.removeClass('active');
			$table.removeClass('highlighted');
		},

		formatVMURI: function(vmboxId, mediaId) {
			var self = this;

			return self.apiUrl + 'accounts/' + self.accountId + '/vmboxes/' + vmboxId + '/messages/' + mediaId + '/raw?auth_token=' + self.getAuthToken();
		},

		playVoicemail: function(template, vmboxId, mediaId) {
			var self = this,
				$row = template.find('.voicemail-row[data-media-id="'+ mediaId +'"]');

			template.find('table').addClass('highlighted');
			$row.addClass('active');

			$row.find('.duration, .actions').hide();

			var uri = self.formatVMURI(vmboxId, mediaId),
				dataTemplate = {
					uri: uri
				},
				templateCell = $(monster.template(self, 'cell-voicemail-player', dataTemplate));

			// If folder is new, we want to change it to saved
			if($row.data('folder') === 'new') {
				self.updateFolder(vmboxId, [ mediaId ], 'saved', function() {
					$row.data('folder', 'saved')
						.attr('data-folder', 'saved');

					$row.find('.status').data('folder', 'saved')
										.attr('data-folder', 'saved')
										.html(self.i18n.active().voicemails.receivedVMs.status['saved']);
				});
			}

			templateCell.find('.close-player').on('click', function() {
				$row.find('.voicemail-player').remove();
				$row.find('.duration, .actions').show();

				template.find('table').removeClass('highlighted');
				$row.removeClass('active');
			});

			$row.append(templateCell);

			// Autoplay in JS. For some reason in HTML, we can't pause the stream properly for the first play.
			templateCell.find('audio').get(0).play();
		},

		voicemailsGetRows: function(filters, vmboxId, callback) {
			var self = this;

			self.newGetVMBoxMessages(filters, vmboxId, function(data) {
				var dataTemplate = {
						voicemails: self.formatMessagesData(data.data, vmboxId)
					},
					$rows = $(monster.template(self, 'voicemails-rows', dataTemplate));

				callback && callback($rows, data);
			});
		},

		displayVMList: function(container, vmboxId) {
			var self = this,
				fromDate = container.find('input.filter-from').datepicker('getDate'),
				toDate = container.find('input.filter-to').datepicker('getDate'),
				filterByDate = container.find('.filter-by-date').hasClass('active');

			container.removeClass('empty');

			// Gives a better feedback to the user if we empty it as we click... showing the user something is happening.
			container.find('.data-state')
					 //.empty()
					 .hide();

			container.find('.loading-state')
					 .show();

			container.find('.hidable').addClass('hidden');
			container.find('.main-select-message').prop('checked', false);

			monster.ui.footable(container.find('.voicemails-table .footable'), {
				getData: function(filters, callback) {
					if(filterByDate) {
						filters = $.extend(true, filters, {
							created_from: monster.util.dateToBeginningOfGregorianDay(fromDate),
							created_to:  monster.util.dateToEndOfGregorianDay(toDate),
						});
					}
					// we do this to keep context
					self.voicemailsGetRows(filters, vmboxId, callback);
				},
				afterInitialized: function() {
					container.find('.data-state')
						 .show();

					container.find('.loading-state')
						 .hide();
				},
				backendPagination: {
					enabled: false
				}
			});
		},

		formatMessagesData: function(voicemails, vmboxId) {
			var self = this;

			_.each(voicemails, function(vm) {
				vm.formatted = {};
				vm.formatted.to = monster.util.formatPhoneNumber(vm.to.substr(0, vm.to.indexOf('@')));
				vm.formatted.from = monster.util.formatPhoneNumber(vm.from.substr(0, vm.from.indexOf('@')));
				vm.formatted.duration = monster.util.friendlyTimer(vm.length/1000);
				vm.formatted.uri = self.formatVMURI(vmboxId, vm.media_id);
				vm.formatted.callId = monster.util.getModbID(vm.call_id, vm.timestamp);
				vm.formatted.mediaId = vm.media_id;
			});

			return voicemails;
		},

		formatVoicemailsData: function(vmbox) {
			var self = this,
				voicemails = vmbox.messages;

			_.each(voicemails, function(vm) {
				vm.formatted = {};
				vm.formatted.to = monster.util.formatPhoneNumber(vm.to.substr(0, vm.to.indexOf('@')));
				vm.formatted.from = monster.util.formatPhoneNumber(vm.from.substr(0, vm.from.indexOf('@')));
				vm.formatted.duration = monster.util.friendlyTimer(vm.length/1000);
				vm.formatted.uri = self.formatVMURI(vmbox.id, vm.media_id);
			});

			return voicemails;
		},

		updateFolder: function(vmboxId, messages, folder, callback) {
			var self = this;

			self.updateVMBoxMessages(vmboxId, messages, folder, function() {
				callback && callback();
			});
		},

		getCDR: function(callId, callback, error) {
			var self = this;

			self.callApi({
				resource: 'cdrs.get',
				data: {
					accountId: self.accountId,
					cdrId: callId,
					generateError: false
				},
				success: function(data) {
					callback && callback(data.data);
				},
				error: function(data, status, globalHandler) {
					if(data && data.error === '404') {
						error && error({});
					}
					else {
						globalHandler(data, { generateError: true });
					}
				}
			});
		},

		getVMBox: function(vmboxId, callback) {
			var self = this;

			self.callApi({
				resource: 'voicemail.get',
				data: {
					accountId: self.accountId,
					voicemailId: vmboxId
				},
				success: function(data) {
					callback && callback(data.data);
				}
			});
		},

		getVMBoxMessages: function(vmboxId, callback) {
			var self = this;

			self.callApi({
				resource: 'voicemail.listMessages',
				data: {
					accountId: self.accountId,
					voicemailId: vmboxId
				},
				success: function(data) {
					callback && callback(data.data);
				}
			});
		},

		newGetVMBoxMessages: function(filters, vmboxId, callback) {
			var self = this;

			self.callApi({
				resource: 'voicemail.listMessages',
				data: {
					accountId: self.accountId,
					voicemailId: vmboxId,
					filters: filters
				},
				success: function(data) {
					callback && callback(data);
				}
			});
		},

		moveVoicemailMessages: function(vmboxId, targetId, messages, callback) {
			var self = this,
				data = {
					messages: messages,
					source_id: targetId
				};

			self.bulkUpdateMessages(vmboxId, data, callback);
		},

		updateVMBoxMessages: function(vmboxId, messages, folder, callback) {
			var self = this,
				data = {
					messages: messages,
					folder: folder
				};

			self.bulkUpdateMessages(vmboxId, data, callback);
		},

		bulkRemoveMessages: function(vmboxId, messages, callback) {
			var self = this;

			self.callApi({
				resource: 'voicemail.deleteMessages',
				data: {
					accountId: self.accountId,
					voicemailId: vmboxId,
					data: {
						messages: messages
					}
				},
				success: function(data) {
					callback && callback(data.data);
				}
			});
		},

		bulkUpdateMessages: function(vmboxId, data, callback) {
			var self = this;

		self.callApi({
				resource: 'voicemail.updateMessages',
				data: {
					accountId: self.accountId,
					voicemailId: vmboxId,
					data: data
				},
				success: function(data) {
					callback && callback(data.data);
				}
			});
		},

		updateVMBox: function(vmbox, callback) {
			var self = this;

			self.callApi({
				resource: 'voicemail.update',
				data: {
					accountId: self.accountId,
					voicemailId: vmbox.id,
					data: vmbox
				},
				success: function(vmbox) {
					callback && callback(vmbox.data);
				}
			});
		},

		listVMBoxes: function(callback) {
			var self = this;

			self.callApi({
				resource: 'voicemail.list',
				data: {
					accountId: self.accountId,
					filters: {
						paginate: false
					}
				},
				success: function(data) {
					callback && callback(data.data);
				}
			});
		}
	};

	return app;
});
