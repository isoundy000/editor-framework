'use strict';

(() => {
  function _isDockPanel (el) {
    return el && el.tagName === 'EDITOR-DOCK-PANEL';
  }

  class DockPanel extends window.HTMLElement {
    /**
     * @property focused
     */
    get focused () {
      return this.getAttribute('focused') !== null;
    }
    set focused (val) {
      if (val) {
        this.setAttribute('focused', '');
      } else {
        this.removeAttribute('focused');
      }
    }

    /**
     * @property activeTab
     */
    get activeTab () {
      return this.$.tabs.activeTab;
    }

    /**
     * @property activeIndex
     */
    get activeIndex () {
      return EditorUI.index(this.$.tabs.activeTab);
    }

    /**
     * @property tabCount
     */
    get tabCount () {
      return this.$.tabs.children.length;
    }

    createdCallback () {
      let root = this.createShadowRoot();
      root.innerHTML = `
        <editor-tabs id="tabs"></editor-tabs>
        <div class="border">
          <div class="frame-wrapper">
            <content select="*"></content>
          </div>
        </div>
      `;
      root.insertBefore(
        EditorUI.createStyleElement('editor-framework://lib/renderer/ui/css/panel.css'),
        root.firstChild
      );

      if ( this.width === null ) { this.width = 200; }
      if ( this.height === null ) { this.height = 200; }
      if ( this.minWidth === null ) { this.minWidth = 200; }
      if ( this.minHeight === null ) { this.minHeight = 200; }

      // query element
      this.$ = {
        tabs: this.shadowRoot.querySelector('#tabs'),
      };

      // init behaviors
      this._initDockable();
      this._initResizable();

      //
      this._initTabs();

      //
      this.addEventListener('focusin', this._onFocusIn.bind(this));
      this.addEventListener('focusout', this._onFocusOut.bind(this));
      this.$.tabs.addEventListener('tab-changed', this._onTabChanged.bind(this));

      // NOTE: we do this in capture phase to make sure it has the highest priority
      this.addEventListener('keydown', event => {
        // 'command+shift+]' || 'ctrl+tab'
        if (
          (event.shiftKey && event.metaKey && event.keyCode === 221) ||
          (event.ctrlKey && event.keyCode === 9)
        ) {
          event.stopPropagation();

          let next = this.activeIndex+1;
          if ( next >= this.tabCount ) {
            next = 0;
          }

          this.select(next);
          this.setFocus();

          return;
        }

        // 'command+shift+[' || 'ctrl+shift+tab'
        if (
          (event.shiftKey && event.metaKey && event.keyCode === 219) ||
          (event.ctrlKey && event.shiftKey && event.keyCode === 9)
        ) {
          event.stopPropagation();

          let prev = this.activeIndex-1;
          if ( prev < 0 ) {
            prev = this.tabCount-1;
          }

          this.select(prev);
          this.setFocus();

          return;
        }
      }, true);

      // grab mousedown in capture phase to make sure we focus on it
      this.addEventListener('mousedown', event => {
        if ( event.which === 1 ) {
          this.setFocus();
        }
      }, true);
    }

    setFocus () {
      if ( this.activeTab ) {
        this.activeTab.frameEL.focus();
      }
    }

    setBlur () {
      if ( this.activeTab ) {
        this.activeTab.frameEL.blur();
      }
    }

    _onMouseDown ( event ) {
      if ( event.which === 1 ) {
        event.stopPropagation();
        this.setFocus();
      }
    }

    _onFocusIn () {
      this._losingFocus = false;
      this.focused = true;
      this.$.tabs._setFocused(true);
    }

    _onFocusOut () {
      this._losingFocus = true;

      setTimeout(() => {
        if ( this._losingFocus ) {
          this.focused = false;
          this.$.tabs._setFocused(false);
        }
      },1);
    }

    _onTabChanged ( event ) {
      event.stopPropagation();

      let detail = event.detail;
      if ( detail.oldTab !== null ) {
        detail.oldTab.frameEL.style.display = 'none';
        EditorUI.fire(detail.oldTab.frameEL, 'panel-hide');
      }

      if ( detail.newTab !== null ) {
        detail.newTab.frameEL.style.display = '';
        EditorUI.fire(detail.newTab.frameEL, 'panel-show');
      }

      Editor.saveLayout();
    }

    _initTabs () {
      //
      let tabs = this.$.tabs;
      tabs.panelEL = this;

      //
      for ( let i = 0; i < this.children.length; ++i ) {
        let el = this.children[i];

        //
        let name = el.getAttribute('name');
        let tabEL = tabs.addTab(name);
        tabEL.setAttribute('draggable', 'true');

        el.style.display = 'none';
        tabEL.frameEL = el;
        tabEL.setIcon( el.icon );
      }

      tabs.select(0);
    }

    _collapseRecursively () {
      this.collapse();
    }

    _finalizeSizeRecursively ( reset ) {
      this._applyFrameSize(reset);
    }

    _finalizeMinMaxRecursively () {
      this._applyFrameMinMax();
    }

    _finalizeStyleRecursively () {
      this._applyStyle();
    }

    _applyFrameSize ( reset ) {
      let autoWidth = false;
      let autoHeight = false;

      // reset width, height
      this.computedWidth = this.width;
      this.computedHeight = this.height;

      for ( let i = 0; i < this.children.length; ++i ) {
        let el = this.children[i];

        // width
        let elWidth = EditorUI.DockUtils.getFrameSize( el, 'width' );
        if ( autoWidth || elWidth === 'auto' ) {
          autoWidth = true;
          this.computedWidth = 'auto';
        } else {
          if ( this.width === 'auto' || elWidth > this.computedWidth ) {
            this.computedWidth = elWidth;
          }
        }

        // height
        let elHeight = EditorUI.DockUtils.getFrameSize( el, 'height' );
        if ( autoHeight || elHeight === 'auto' ) {
          autoHeight = true;
          this.computedHeight = 'auto';
        } else {
          if ( this.height === 'auto' || elHeight > this.computedHeight ) {
            this.computedHeight = elHeight;
          }
        }
      }

      if ( reset ) {
        this.curWidth = this.computedWidth;
        this.curHeight = this.computedHeight;
      }
      // if reset is false, we just reset the part that
      else {
        if ( this.parentNode.row ) {
          this.curHeight = this.computedHeight;
        } else {
          this.curWidth = this.computedWidth;
        }
      }
    }

    _applyFrameMinMax () {
      let infWidth = false;
      let infHeight = false;

      for ( let i = 0; i < this.children.length; ++i ) {
        let el = this.children[i];

        // NOTE: parseInt('auto') will return NaN, it will return false in if check

        // min-width
        let minWidth = parseInt(el.getAttribute('min-width'));
        if ( minWidth ) {
          if ( this.minWidth === 'auto' || minWidth > this.minWidth ) {
            this.computedMinWidth = minWidth;
          }
        }

        // min-height
        let minHeight = parseInt(el.getAttribute('min-height'));
        if ( minHeight ) {
          if ( this.minHeight === 'auto' || minHeight > this.minHeight ) {
            this.computedMinHeight = minHeight;
          }
        }

        // max-width
        let maxWidth = parseInt(el.getAttribute('max-width'));
        maxWidth = isNaN(maxWidth) ? 'auto' : maxWidth;
        if ( infWidth || maxWidth === 'auto' ) {
          infWidth = true;
          this.computedMaxWidth = 'auto';
        } else {
          if ( this.maxWidth === 'auto' ) {
            infWidth = true;
          } else if ( maxWidth && maxWidth > this.maxWidth ) {
            this.computedMaxWidth = maxWidth;
          }
        }

        // max-height
        let maxHeight = parseInt(el.getAttribute('max-height'));
        maxHeight = isNaN(maxHeight) ? 'auto' : maxHeight;
        if ( infHeight || maxHeight === 'auto' ) {
          infHeight = true;
          this.computedMaxHeight = 'auto';
        } else {
          if ( this.maxHeight === 'auto' ) {
            infHeight = true;
          } else if ( maxHeight && maxHeight > this.maxHeight ) {
            this.computedMaxHeight = maxHeight;
          }
        }
      }
    }

    _applyStyle () {
      // min-width
      if ( this.computedMinWidth !== 'auto' ) {
        this.style.minWidth = this.computedMinWidth + 'px';
      } else {
        this.style.minWidth = 'auto';
      }

      // max-width
      if ( this.computedMaxWidth !== 'auto' ) {
        this.style.maxWidth = this.computedMaxWidth + 'px';
      } else {
        this.style.maxWidth = 'auto';
      }

      // min-height
      if ( this.computedMinHeight !== 'auto' ) {
        this.style.minHeight = this.computedMinHeight + 'px';
      } else {
        this.style.minHeight = 'auto';
      }

      // max-height
      if ( this.computedMaxHeight !== 'auto' ) {
        this.style.maxHeight = this.computedMaxHeight + 'px';
      } else {
        this.style.maxHeight = 'auto';
      }
    }

    outOfDate ( idxOrFrameEL ) {
      let tabs = this.$.tabs;

      if ( typeof idxOrFrameEL === 'number' ) {
        tabs.outOfDate(idxOrFrameEL);
      } else {
        for ( let i = 0; i < this.children.length; ++i ) {
          if ( idxOrFrameEL === this.children[i] ) {
            tabs.outOfDate(i);
            break;
          }
        }
      }
    }

    select ( idxOrFrameEL ) {
      let tabs = this.$.tabs;

      if ( typeof idxOrFrameEL === 'number' ) {
        tabs.select(idxOrFrameEL);
      } else {
        for ( let i = 0; i < this.children.length; ++i ) {
          if ( idxOrFrameEL === this.children[i] ) {
            tabs.select(i);
            break;
          }
        }
      }
    }

    insert ( tabEL, frameEL, insertBeforeTabEL ) {
      let tabs = this.$.tabs;

      // let name = frameEL.getAttribute('name');
      tabs.insertTab(tabEL, insertBeforeTabEL);
      tabEL.setAttribute('draggable', 'true');

      // NOTE: if we just move tabs, we must not hide frameEL
      if ( tabEL.parentNode !== tabs ) {
        frameEL.style.display = 'none';
      }
      tabEL.frameEL = frameEL;
      tabEL.setIcon( frameEL.icon );

      //
      if ( insertBeforeTabEL ) {
        if ( frameEL !== insertBeforeTabEL.frameEL ) {
          this.insertBefore(frameEL, insertBeforeTabEL.frameEL);
        }
      } else {
        this.appendChild(frameEL);
      }

      //
      this._applyFrameMinMax();
      this._applyStyle();

      return EditorUI.index(tabEL);
    }

    add ( frameEL ) {
      let tabs = this.$.tabs;
      let name = frameEL.getAttribute('name');
      let tabEL = tabs.addTab(name);

      tabEL.setAttribute('draggable', 'true');

      frameEL.style.display = 'none';
      tabEL.frameEL = frameEL;
      tabEL.setIcon( frameEL.icon );

      this.appendChild(frameEL);

      //
      this._applyFrameMinMax();
      this._applyStyle();

      //
      return this.children.length - 1;
    }

    closeNoCollapse ( tabEL ) {
      let tabs = this.$.tabs;

      //
      tabs.removeTab(tabEL);
      if ( tabEL.frameEL ) {
        let panelEL = tabEL.frameEL.parentNode;
        panelEL.removeChild(tabEL.frameEL);
        tabEL.frameEL = null;
      }

      //
      this._applyFrameMinMax();
      this._applyStyle();
    }

    close ( tabEL ) {
      this.closeNoCollapse(tabEL);
      this.collapse();
    }

    // override EditorUI.Resizable._notifyResize()
    _notifyResize () {
      EditorUI.fire(this, 'resize');

      // dispatch 'resize' event for all panel-frame no matter if they are actived
      for ( let i = 0; i < this.children.length; ++i ) {
        let childEL = this.children[i];
        EditorUI.fire(childEL, 'resize');
      }
    }

    // override EditorUI.Dockable.collapse
    collapse () {
      // remove from dock;
      if ( this.$.tabs.children.length === 0 ) {
        if ( this.parentNode._dockable ) {
          return this.parentNode.removeDock(this);
        }
      }

      return false;
    }

    // override EditorUI.Dockable._reflowRecursively
    _reflowRecursively () {
    }
  }

  Editor.JS.addon(DockPanel.prototype, EditorUI.Resizable, EditorUI.Dockable);

  EditorUI.isDockPanel = _isDockPanel;
  document.registerElement('editor-dock-panel', DockPanel);

})();
