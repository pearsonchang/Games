const paletteKey=new URLSearchParams(location.search).get('theme');document.documentElement.dataset.palette=['web3','mint','coral','tech'].includes(paletteKey)?paletteKey:'web3';
