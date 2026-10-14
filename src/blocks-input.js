'use strict';

// Click placement uses an actual tile, rather than a possibly empty bounding-box corner.
function blockPlacementAnchor(piece) {
  const [row,col]=piece.cells.reduce((first,cell)=>cell[0]<first[0]||(cell[0]===first[0]&&cell[1]<first[1])?cell:first);
  return {row,col};
}
function blockCellTarget(piece,row,col) {
  const anchor=blockPlacementAnchor(piece);
  return {row:row-anchor.row,col:col-anchor.col};
}

// Preview and release both use the nearest grid position; never clamp an invalid
// origin into the board or search for another empty position behind the pointer.
function blockPointerTarget(piece, point, grip, grid, previous=null) {
  const {left,top,cell,pitch,bounds}=grid;
  const lift=grip.touch?Math.max(48,pitch*1.4):0;
  const width=(piece.cols-1)*pitch+cell, height=(piece.rows-1)*pitch+cell;
  const x=point.x-(grip.x===undefined?grip.col*pitch+cell/2:width*grip.x);
  const y=point.y-(grip.y===undefined?grip.row*pitch+cell/2:height*grip.y)-lift;
  const snap=(value,last,max)=>{
    const nearest=Math.round(value)+0,margin=Math.min(4,pitch*.08)/pitch;
    // A small spatial dead band, never a timer. Crossing outside the board still
    // invalidates immediately; we do not pull out-of-bounds pieces back inside.
    if(previous?.inside&&Number.isInteger(last)&&nearest>=0&&nearest<=max&&Math.abs(value-last)<=.5+margin)return last;
    return nearest;
  };
  const col=snap((x-left)/pitch,previous?.col,8-piece.cols), row=snap((y-top)/pitch,previous?.row,8-piece.rows);
  // Judge the complete snapped footprint, not the unsnapped floating sprite.
  // This gives an edge cell the same half-pitch target area as an interior cell.
  const snappedX=left+col*pitch, snappedY=top+row*pitch;
  const inside=snappedX>=bounds.left && snappedY>=bounds.top && snappedX+width<=bounds.right && snappedY+height<=bounds.bottom;
  return {row,col,x,y,inside,width,height,lift};
}
if (typeof module!=='undefined') module.exports={blockPointerTarget,blockPlacementAnchor,blockCellTarget};
