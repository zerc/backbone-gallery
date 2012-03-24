/*global jQuery, window, document */
/*jslint nomen: true, maxerr: 50, indent: 4 */

(function ($) {
    'use strict';

    var Photo, PhotoView, BigPhotoView, Gallery, Photos, PhotosView, AlbumRouter, Album,
        settings = {};

    function waitForImage(img, callback) {
        if (typeof img === 'string') {
            var obj = new Image();
            obj.src = img;
            img = obj;
        }

        if (!img.complete || (typeof img.naturalWidth !== "undefined" && img.naturalWidth === 0)) {
            // Image not load ... waiting
            setTimeout(function () { waitForImage(img, callback); }, 100);
        } else {
            callback.apply(img);
        }
    }

    Album = function (opts) {
        var router, photos;
        settings = $.extend(settings, opts);

        Photo = Backbone.Model.extend({
            defaults: {
                id: 0,
                hits: 0,

                image: "",
                i_width: 0,
                i_height: 0,

                thumb: "",
                t_width: 0,
                t_height: 0,

                // for thumbs
                _marginTop: function () {
                    if (this.t_width < this.t_height) {
                        return 'style="margin-top:-' + parseInt((this.t_height - this.t_width) * 0.2, 10) + 'px;"';
                    } else if (this.t_height < 80) {
                        return 'style="margin-top:' + parseInt((80 - this.t_height) / 2, 10) + 'px;"';
                    }
                    return '';
                }
            }
        });

        Photos = Backbone.Collection.extend({
            model: Photo,
            url: settings.photos_url
        });

        PhotoView = Backbone.View.extend({
            tagName: 'div',
            className: 'photo',
            
            // TODO: separate this
            template: '<a href="<%= image %>" rel="gr1">\
                    <img src="<%= thumb %>" alt="#" width="<%= t_width %>" height="<%= t_height %>" <%= _marginTop() %> />\
                </a>',

            events: {
                'click div.photo a': 'openPhoto'
            },

            initialize: function(){
                _.bindAll(this, 'render', 'openPhoto');
            },

            render: function(){
                var tmpl = _.template(this.template);
                $(this.el).html(tmpl(this.model.attributes));
                return this;
            },

            openPhoto: function () {
                try {
                    console.log(this.model)
                    this.options.big_viewer.open(this.model);
                } catch (e) {
                    console.log(e);
                }

                return false;
            },

        });

        BigPhotoView = Backbone.View.extend({
            tagName: 'div',
            id: 'gallery_container',

            events: {
                'click #gallery_close': 'close',
                'click #gallery_photo_holder': function () { this.move('next'); },

                'control.disable #gallery_controls': 'controlDisable',
                'control.enable #gallery_controls': 'controlEnable',

                'click #gallery_controls div': 'controlClick'
            },

            initialize: function () {
                _.bindAll(this, 'render', 'open', 'close', 'move', 'controlDisable', 'controlEnable', 'controlClick');

                var self = this,
                    container_valign,
                    key;

                this.win = $(window);
                this.doc = $(document);

                this.opened = false;
                this.min_width = 320;
                this.min_height = 240;
                this.isShowtime = false;
                this.showtime_id = undefined;

                container_valign = function () {
                    var p_top = $.browser.msie ? $body.scrollTop() : $(window).scrollTop();
                    self.$el.css("padding-top", p_top + "px");
                };

                // init carcass
                this.body           = $('body');
                this.overlay        = $('<div id="gallery_overlay"></div>');
                this.$el            = $('<div id="gallery_container"></div>');
                this.toolbar        = $('<div id="gallery_toolbar"></div>');
                this.loader         = $('<div id="gallery_image_loader"><div class="animate"></div></div>');

                this.logoHolder     = $('<div id="gallery_logo_holder"></div>');
                this.controls       = $('<div id="gallery_controls"><table><tr>\
                        <td class="prev" title="Клавиша: cтрелка влево"><div><ins></ins>Назад</div></td>\
                        <td class="showtime" title="Клавиша: пробел"><div><ins></ins></div></td>\
                        <td class="next" title="Клавиша: cтрелка вправо"><div>Вперед<ins></ins></div></td>\
                        </tr></table></div>');

                this.close_control  = $('<a href="#" id="gallery_close" title="Клавиша: Esc"><span>Закрыть</span><ins></ins></a>');
                this.contentHolder  = $('<div id="gallery_content_holder"></div>');
                this.photoHolder    = $('<div id="gallery_photo_holder"></div>');
                // TODO: use this for display photo info
                this.infoHolder     = $('<div id="gallery_info_holder"></div>');

                container_valign();

                this.doc.bind({
                    'keydown' : function (e) {
                        if (!self._allowExec()) return;

                        key = e.keyCode || e.which;
                        if (key === 27) { // esc
                            e.preventDefault();
                            self.close();
                        } else if (key === 39 || key === 37) {
                            self.controls.find((key === 39 ? '.next' : '.prev') + ' div').click();
                        } else if (key === 32) {
                            self.controls.find('.showtime div').click();
                        }
                    },
                    'mousedown'  : function () { return !self._allowExec(); },
                    'scroll' : container_valign
                });

                this.win.bind('resize', function () {
                    if (!self._allowExec()) return;
                    self._alignAndResize(self.photoHolder.children("img"));
                });

                this.render();

            },

            /* Gallery Controls */
            _getControl: function (control_name) {
                var selector = 'div';

                if (control_name !== 'all') {
                    selector = _.map(control_name.split(','), function (name) {
                            return 'td.' + name + ' div';
                        }).join(', ');
                }

                return this.controls.find(selector);
            },

            controlDisable: function (e, control_name) {
                this._getControl(control_name).addClass('disable');
            },

            controlEnable: function (e, control_name) {
                this._getControl(control_name).removeClass('disable');
            },

            controlClick: function (e) {
                var control_name = $(e.target).closest('td').attr('class');
                if (control_name === 'next' || control_name === 'prev') {
                    !this.move(control_name)
                        ? this.controls.trigger('control.disable', [control_name])
                        : this.controls.trigger('control.enable', ['all']);
                } else if (control_name === 'showtime') {
                    if (this.isShowtime) {
                        clearTimeout(this.showtime_id);
                        this.isShowtime = this.showtime_id = false;
                        $(e.target).children('ins').removeClass('active');
                    } else {
                        this.isShowtime = true;
                        $(e.target).children('ins').addClass('active');
                        this.move('next');
                    }
                }
            },

            _allowExec: function (func) {
                return this.opened;
            },

            _alignAndResize: function (photo) {
                var w_width = this.win.width() - 40,
                    w_height = this.win.height() - 60 - 40,
                    w = this.model.get('i_width'),
                    h = this.model.get('i_height'),
                    width = Math.max(Math.min(w_width, w), this.min_width),
                    height = Math.max(Math.min(w_height, h), this.min_height),

                    rate = Math.min(width / w, height / h),

                    p_width = Math.round(w * rate),
                    p_height = Math.round(h * rate),
                    margin_top = Math.max((w_height - p_height) / 2, 0);

                photo.width(p_width).height(p_height);

                this.photoHolder.css("margin-top", margin_top + "px");
                this.contentHolder.width(p_width);

                return photo;
            },

            render: function () {
                this.overlay.css({"height": $(document).height()});
                this.$el.css({"height": $(document).height()});

                // build skelet
                this.body.append(this.overlay.hide());;
                this.toolbar.append(this.close_control, this.controls);
                this.contentHolder.append(this.loader.hide(), this.photoHolder, this.infoHolder);
                this.$el.append(this.toolbar, this.contentHolder);
                this.body.append(this.$el.hide());
            },

            open: function (model) {
                this.model = model;
                this.opened = true;
                this.overlay.show();
                this.$el.show();
                this.body.css({"overflow": "hidden"});
                this.controls.trigger('control.disable', ['all']);

                this.openPhoto(model);
            },

            openPhoto: function () {
                var self = this,
                    photo = new Image();

                photo.src = this.model.get('image');
                waitForImage(photo, function () {
                    self.photoHolder.html(self._alignAndResize($(this)));
                    self.contentHolder.show();

                    location.hash = '/' + self.model.get('id');

                    if (self.model.collection.indexOf(self.model) === 0)
                        self.controls.trigger('control.enable', ['next,showtime']);
                    else if (self.model.collection.indexOf(self.model) === self.model.collection.length-1)
                        self.controls.trigger('control.enable', ['prev']);
                    else
                        self.controls.trigger('control.enable', ['all']);

                    if (self.isShowtime && !self.showtime_id) {
                        self.showtime_id = setTimeout(function () {
                            if (!self.move("next")) {
                                self.controls.find('td.showtime div').click();
                            }
                            self.showtime_id = undefined;
                        }, 3500);
                    }
                });
            },

            move: function (way) {
                var i, x, direction;

                direction = way === "next" ? 1 : -1;
                i = this.model.collection.indexOf(this.model) + direction;

                if (i >= this.model.collection.length || i < 0) { return false; }

                this.model = this.model.collection.at(i);
                this.openPhoto();
                return true;
            },

            close: function () {
                this.opened = false;
                this.body.css("overflow", "auto");
                this.overlay.hide();
                this.$el.hide();
                this.contentHolder.hide();
                location.hash = '';
            }
        });


        PhotosView = Backbone.View.extend({
            el: '.album__photos',

            initialize: function(){
                _.bindAll(this, 'render', 'appendItem');

                this.bigPhotoView = new BigPhotoView();

                if (settings.photos) {
                    this.collection = new Photos(settings.photos);
                    this.render();
                } else {
                    this.collection = new Photos();
                    this.collection.fetch();
                    this.collection.bind('reset', this.render);
                }

            },

            render: function(){
                var self = this;

                _(this.collection.models).each(function (item) {
                    self.appendItem(item);
                }, this);

            },

            appendItem: function (item) {
                var photoView = new PhotoView({model: item, big_viewer: this.bigPhotoView});
                $(this.el).append(photoView.render().el);
            }
        });

        AlbumRouter = Backbone.Router.extend({
            routes: {
                '': 'index'
            },

            initialize: function () {
                this.photosView = new PhotosView();
                this.route(/\/(\d+)/, 'id', this.openPhoto);
            },

            index: function () {
                this.photosView.bigPhotoView.close();
            },

            openPhoto: function (photo_id) {
                var self = this,
                    model = this.photosView.collection.get(photo_id);

                if (!model) {
                    this.photosView.collection.bind('reset', function () {
                        self.openPhoto(photo_id);
                    })
                } else {
                    this.photosView.bigPhotoView.open(model);
                }

            }
        });

        router = new AlbumRouter();
        Backbone.history.start();
    };

    window.Album = Album;
}(jQuery));
