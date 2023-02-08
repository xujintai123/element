## 懒加载
### handleExpandIconClick方法
初次展开节点（未 loaded）
点击展开图标 => 触发节点（node 实例）的 expand 方法

```
 handleExpandIconClick() {
        /* 叶子节点直接退出 */
        if (this.node.isLeaf) return;
        /* 已经展开则关闭 */
        if (this.expanded) {
          // 抛出节点关闭事件
          this.tree.$emit('node-collapse', this.node.data, this.node, this);
          this.node.collapse();
        } else {
          /* 展开 */
          this.node.expand(); // node.expand
          // 抛出节点展开事件
          this.$emit('node-expand', this.node.data, this.node, this);
        }
      }
```

### expand 方法
- 如果此节点开启懒加载 && 传递方法 && 未加载；则调用节点的loadData方法，并且将修改expand状态的回调传给loadData方法。
- 否则直接标记节点的状态为 expand；

```
  // 调用loadData方法 将节点的expanded置为true；显示子节点
  expand(callback, expandParent) {
    /* 如果expandParent，则节点自底向上进行展开； 否则只修改当前节点的展开状态 */
    <!-- done方法 改变当前节点的展开状态 -->
    const done = () => {
      if (expandParent) {
        let parent = this.parent;
        while (parent.level > 0) {
          parent.expanded = true;
          parent = parent.parent;
        }
      }
      this.expanded = true;
      if (callback) callback();
    };

    // 开启懒加载 && 传递方法 && 未加载
    if (this.shouldLoadData()) {
      this.loadData((data) => {
        if (data instanceof Array) {
          if (this.checked) {
            this.setChecked(true, true);
          } else if (!this.store.checkStrictly) {
            reInitChecked(this);
          }
          // data为数组才会调用done
          done();
        }
      });
    } else {
      done();
    }
  }
```
### loadData 方法
loadData 方法调用用户传入的 load 方法，传入 resolve回调；
resolve调用成功后，将loaded状态置为true

其实也就是说，懒加载情况下，当用户首次点击加载图标，就会调用用户传入的load方法，根据用户在load方法中resolve的值来进行构建子节点。

```
文件 node.js
loadData(callback, defaultProps = {}) {
    // 开启懒加载并且未加载并且当前不在加载中
    if (this.store.lazy === true && this.store.load && !this.loaded && (!this.loading || Object.keys(defaultProps).length)) {
      this.loading = true;

      // 给当前节点添加子节点
      const resolve = (children) => {
        this.childNodes = [];

        this.doCreateChildren(children, defaultProps);
        this.loaded = true;
        this.loading = false;
        this.updateLeafState();
        // 节点的展开状态在callback中进行
        if (callback) {
          callback.call(this, children);
        }
      };

      // this.store.load就是用户传入的load方法
      // 也就是首次触发展开节点后 会调用用户传入的load方法，传入resolve，用户将需要添加的数据传入resolve；构建出子节点
      this.store.load(this, resolve);
    } else {
      if (callback) {
        callback.call(this);
      }
    }
  }

```
