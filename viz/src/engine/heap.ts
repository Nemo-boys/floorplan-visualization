export class Heap<T> {
  a: T[];
  less: (x: T, y: T) => boolean;
  constructor(less: (x: T, y: T) => boolean) {
    this.a = [];
    this.less = less;
  }
  get size(): number {
    return this.a.length;
  }
  peek(): T {
    return this.a[0];
  }
  push(x: T): void {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): T {
    const a = this.a,
      top = a[0],
      last = a.pop() as T;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}
