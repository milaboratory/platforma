registerPaint(
  'pl-placeholder-table-skeleton',
  class {
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} size
     * @param {number} size.width
     * @param {number} size.height
     */
    paint(ctx, { width, height }) {
      const headerHeight = 42;
      const headerWidth = 48;

      ctx.fillStyle = '#F7F8FA';

      // headers
      {
        const path = new Path2D();
        path.lineTo(width, 0);
        path.lineTo(width, headerHeight);
        path.lineTo(headerWidth, headerHeight);
        path.lineTo(headerWidth, height);
        path.lineTo(0, height);
        path.lineTo(0, 0);
        ctx.fill(path);
      }

      ctx.strokeStyle = '#E1E3EB';

      // vertical lines
      const columnWidth = (width - headerWidth) / 6;
      for (
        let horizontalPosition = headerWidth;
        horizontalPosition < width;
        horizontalPosition += columnWidth
      ) {
        const path = new Path2D();
        path.moveTo(horizontalPosition, 0);
        path.lineTo(horizontalPosition, height);
        ctx.stroke(path);
      }

      // horizontal lines
      for (
        let verticalPosition = headerHeight;
        verticalPosition < height;
        verticalPosition += headerHeight
      ) {
        const path = new Path2D();
        path.moveTo(0, verticalPosition);
        path.lineTo(width, verticalPosition);
        ctx.stroke(path);
      }
    }
  },
);

registerPaint(
  'pl-placeholder-graph-skeleton',
  class {
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} size
     * @param {number} size.width
     * @param {number} size.height
     */
    paint(ctx, { width, height }) {
      const padding = 6;
      const cellWidth = 100;
      const cellHeight = 60;

      ctx.strokeStyle = '#E1E3EB';

      // vertical lines
      for (
        let horizontalPosition = cellWidth + padding;
        horizontalPosition <= width;
        horizontalPosition += cellWidth
      ) {
        const path = new Path2D();
        path.moveTo(horizontalPosition, 0);
        path.lineTo(horizontalPosition, height - padding);
        ctx.stroke(path);
      }

      // horizontal lines
      for (
        let verticalPosition = height - padding - cellHeight;
        verticalPosition >= 0;
        verticalPosition -= cellHeight
      ) {
        const path = new Path2D();
        path.moveTo(padding, verticalPosition);
        path.lineTo(width, verticalPosition);
        ctx.stroke(path);
      }

      ctx.strokeStyle = '#110529';

      // vertical arrow
      {
        const path = new Path2D();
        path.moveTo(padding, height - padding);
        path.lineTo(padding, 0);
        path.lineTo(0, padding);
        path.moveTo(padding, 0);
        path.lineTo(padding * 2, padding);
        ctx.stroke(path);
      }

      // horizontal arrow
      {
        const path = new Path2D();
        path.moveTo(padding, height - padding);
        path.lineTo(width, height - padding);
        path.lineTo(width - padding, height - padding * 2);
        path.moveTo(width, height - padding);
        path.lineTo(width - padding, height);
        ctx.stroke(path);
      }
    }
  },
);
