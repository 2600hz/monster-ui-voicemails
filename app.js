define(function(require){
	var $ = require('jquery'),
		_ = require('underscore'),
		monster = require('monster'),
		footable = require('footable'),
		footableFilter = require('footable-filter'),
		footableSort = require('footable-sort'),
		chosen = require('chosen');

	var app = {
		name: 'voicemails',

		css: [ 'app' ],

		i18n: { 
			'en-US': { customCss: false }
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
				appName: self.i18n.active().voicemails.title,
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

		bindReceivedVMs: function(template) {
			var self = this,
				currentVM,
				$selectVMBox = template.find('#select_vmbox');

			$selectVMBox.chosen({search_contains: true, width: '220px', placeholder_text_single: self.i18n.active().voicemails.receivedVMs.actionBar.selectVM.none });

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
						.empty()
						.hide();

				template.find('.loading-state')
						.show();

				self.updateFolder(vmboxId, messages, folder, function(vmbox) {
					self.displayVMList(template, vmboxId, vmbox);
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
					callId = $row.data('call-id'),
					timestamp = $row.data('timestamp'),
					jsDate = monster.util.gregorianToDate(timestamp),
					UTCYear = jsDate.getUTCFullYear() + '',
					UTCMonth = jsDate.getUTCMonth() + 1,
					formattedUTCMonth = UTCMonth < 10 ? '0' + UTCMonth : UTCMonth + '',
					modbString = UTCYear + formattedUTCMonth + '-' + callId;

				self.getCDR(modbString, function(cdr) {
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
					template.find('.mark-as-wrapper').removeClass('hidden');
					template.find('.main-select-message').prop('checked', true);
				}
				else{
					template.find('.mark-as-wrapper').addClass('hidden');
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

			template.find('.search-query').on('keyup', function() {
				var searchString = $(this).val().toLowerCase(),
					rows = template.find('.voicemails-table tbody > tr'),
					emptySearch = $(''),
					showOrHideRow = function(row) {
						var $row = $(row),
							keyWords = searchString.split(' '),
							show = true;

						_.each(keyWords,function(word) {
							if($row.data('search').toLowerCase().indexOf(word) < 0) {
								show = false;
							}
						});

						show ? $row.show() : $row.hide();
					};

				_.each(rows, function(row) {
					showOrHideRow(row);
				});
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

			return self.apiUrl + 'accounts/' + self.accountId + '/vmboxes/' + vmboxId + '/messages/' + mediaId + '/raw?auth_token=' + self.authToken + '&folder=saved'
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

		displayVMList: function(container, vmboxId, vmboxData) {
			var self = this;

			container.removeClass('empty');

			// Gives a better feedback to the user if we empty it as we click... showing the user something is happening.
			container.find('.data-state')
					 .empty()
					 .hide();

			container.find('.loading-state')
					 .show();

			container.find('.mark-as-wrapper').addClass('hidden');
			container.find('.main-select-message').prop('checked', false);

			var afterData = function(vmbox) {
				var dataTemplate = {
						voicemails: self.formatVoicemailsData(vmbox)
					},
					template = $(monster.template(self, 'voicemails-list', dataTemplate));

				template.find('.footable')
						.footable($, footable);

				container.find('.data-state')
						 .empty()
						 .append(template)
						 .show();

				container.find('.loading-state')
						 .hide();
			}

			if(vmboxData) {
				afterData(vmboxData);
			}
			else {
				self.getVMBox(vmboxId, function(vmboxData) {
					afterData(vmboxData);
				});
			}
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

			self.getVMBox(vmboxId, function(vmbox) {
				var messagesToUpdate = vmbox.messages;

				_.each(messagesToUpdate, function(msg) {
					if(messages.indexOf(msg.media_id) >= 0) {
						msg.folder = folder;
					}
				});

				vmbox.messages = messagesToUpdate;

				self.updateVMBox(vmbox, function(updatedVMBox) {
					callback && callback(updatedVMBox);
				});
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