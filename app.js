import { useGsiTerrainSource } from 'https://unpkg.com/maplibre-gl-gsi-terrain@2.3.0/dist/terrain.js';

/* ==========================================================================
   航空写真タイムトラベル - アプリケーション・コアロジック (app.js)
   ========================================================================== */

// --- 1. 定数・設定値の定義 (Constants & Configuration) ---

// 年代別空中写真の情報定義 (国土地理院タイル - 大文字小文字や年代フォルダ定義の修正版)
const ERAS = [
  { 
    id: 'ort_taisho', 
    name: '1928年頃 (大正・昭和初期)', 
    url: 'https://cyberjapandata.gsi.go.jp/xyz/ort_taisho/{z}/{x}/{y}.png', 
    attribution: '大正・昭和初期空中写真', 
    minZoom: 12, 
    maxZoom: 17 
  },
  { 
    id: 'ort_riku10', 
    name: '1936～1942年頃 (昭和10年代)', 
    url: 'https://cyberjapandata.gsi.go.jp/xyz/ort_riku10/{z}/{x}/{y}.png', 
    attribution: '陸地測量部空中写真', 
    minZoom: 12, 
    maxZoom: 17 
  },
  { 
    id: 'ort_USA10', 
    name: '1945～1950年頃 (終戦直後)', 
    url: 'https://cyberjapandata.gsi.go.jp/xyz/ort_USA10/{z}/{x}/{y}.png', 
    attribution: '米軍撮影空中写真', 
    minZoom: 10, 
    maxZoom: 17 
  },
  { 
    id: 'ort_old10', 
    name: '1961～1969年頃 (昭和30年代)', 
    url: 'https://cyberjapandata.gsi.go.jp/xyz/ort_old10/{z}/{x}/{y}.png', 
    attribution: '昭和30年代空中写真', 
    minZoom: 10, 
    maxZoom: 17 
  },
  { 
    id: 'gazo1', 
    name: '1974～1978年頃 (昭和40年代)', 
    url: 'https://cyberjapandata.gsi.go.jp/xyz/gazo1/{z}/{x}/{y}.jpg', 
    attribution: '昭和40年代空中写真', 
    minZoom: 10, 
    maxZoom: 17 
  },
  { 
    id: 'gazo2', 
    name: '1979～1983年頃 (昭和50年代)', 
    url: 'https://cyberjapandata.gsi.go.jp/xyz/gazo2/{z}/{x}/{y}.jpg', 
    attribution: '昭和50年代空中写真', 
    minZoom: 10, 
    maxZoom: 17 
  },
  { 
    id: 'gazo3', 
    name: '1984～1986年頃 (昭和60年代)', 
    url: 'https://cyberjapandata.gsi.go.jp/xyz/gazo3/{z}/{x}/{y}.jpg', 
    attribution: '昭和60年代空中写真', 
    minZoom: 10, 
    maxZoom: 17 
  },
  { 
    id: 'gazo4', 
    name: '1987～1990年頃 (平成初期)', 
    url: 'https://cyberjapandata.gsi.go.jp/xyz/gazo4/{z}/{x}/{y}.jpg', 
    attribution: '平成初期空中写真', 
    minZoom: 10, 
    maxZoom: 17 
  },
  { 
    id: 'seamlessphoto', 
    name: '現在 (最新シームレス写真)', 
    url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', 
    attribution: '最新空中写真', 
    minZoom: 2, 
    maxZoom: 18 
  }
];

// デフォルト初期位置: 渋谷駅周辺
const DEFAULT_LOC = {
  lng: 139.701636,
  lat: 35.658034,
  zoom: 15.5,
  pitch: 30,
  bearing: 0
};

// --- 2. 状態管理変数 (Application State) ---
let maps = []; // map1, map2, map3, map4 を格納
let activeLayout = 'single'; // 'single', 'swipe', 'split', 'grid'
let currentEraIndex = 8; // デフォルト：現在 (ERASの最後)
let swipeLeftEraIndex = 4; // スライド比較の左側 (デフォルト: 1974~1978)
let swipeRightEraIndex = 8; // スライド比較の右側 (デフォルト: 現在)
let splitLeftEraIndex = 2; // 2画面分割の左側 (デフォルト: 1945~1950)
let splitRightEraIndex = 8; // 2画面分割の右側 (デフォルト: 現在)

let is3D = false;
let exaggeration = 1.5;

// タイムライン自動再生用タイマー
let playbackInterval = null;
let playbackSpeed = 2500; // ms

// スワイプ比較のしきい値位置 (%)
let swipePosition = 50;

// フライトシミュレーション関連
let flightStartPoint = null; // [lng, lat]
let flightGoalPoint = null; // [lng, lat]
let flightStartMarker = null;
let flightGoalMarker = null;
let isSettingStartPoint = false;
let isSettingGoalPoint = false;
let flightAnimationId = null;
let isFlying = false;

// マップ間同期用の制御フラグ
let isSyncing = false;
let activeSyncMap = null;

// --- 3. アプリ初期化処理 (Initialization) ---

document.addEventListener('DOMContentLoaded', () => {
  // URLクエリパラメータの解析
  parseUrlParams();
  
  // DOM要素の設定
  initDomElements();
  
  // 地図インスタンスの初期化
  initMaps();
  
  // イベントリスナーのバインド
  bindEvents();
});

// DOM要素の生成やセレクトボックス初期化
function initDomElements() {
  // 年代比較用の選択肢を生成
  const eraLeftSelect = document.getElementById('era-left-select');
  const eraRightSelect = document.getElementById('era-right-select');
  
  ERAS.forEach((era, idx) => {
    // 左用
    const optL = document.createElement('option');
    optL.value = idx;
    optL.textContent = era.name;
    optL.selected = (idx === (activeLayout === 'swipe' ? swipeLeftEraIndex : splitLeftEraIndex));
    eraLeftSelect.appendChild(optL);
    
    // 右用
    const optR = document.createElement('option');
    optR.value = idx;
    optR.textContent = era.name;
    optR.selected = (idx === (activeLayout === 'swipe' ? swipeRightEraIndex : splitRightEraIndex));
    eraRightSelect.appendChild(optR);
  });
  
  // タイムラインのスライダ設定
  const timelineSlider = document.getElementById('timeline-slider');
  timelineSlider.max = ERAS.length - 1;
  timelineSlider.value = currentEraIndex;
  
  // タイムライン目盛りの生成
  const ticksContainer = document.getElementById('timeline-ticks-container');
  ticksContainer.innerHTML = '';
  ERAS.forEach((era, idx) => {
    const tick = document.createElement('div');
    tick.className = `timeline-tick-label ${idx === currentEraIndex ? 'active' : ''}`;
    tick.style.left = `${(idx / (ERAS.length - 1)) * 100}%`;
    
    // 短縮表示
    let shortName = era.name.split('年')[0];
    if (shortName.includes('現在')) shortName = '現在';
    tick.textContent = shortName;
    tick.dataset.index = idx;
    
    // 目盛りクリックで切り替え
    tick.addEventListener('click', () => {
      if (isFlying) return;
      timelineSlider.value = idx;
      updateEraFromSlider(idx);
    });
    
    ticksContainer.appendChild(tick);
  });
  
  // 3D地形スイッチの状態反映
  document.getElementById('terrain-toggle').checked = is3D;
  if (is3D) {
    document.getElementById('terrain-settings').classList.remove('hide');
  }
}

// MapLibre 地図インスタンスの初期化
function initMaps() {
  const containerIds = ['map-1', 'map-2', 'map-3', 'map-4'];
  let loadedCount = 0;
  
  // MapLibre用基本スタイル (国土地理院 最新空中写真をベース)
  const baseMapStyle = {
    version: 8,
    sources: {
      'gsi-seamless': {
        type: 'raster',
        tiles: ['https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'],
        tileSize: 256,
        attribution: '国土地理院'
      }
    },
    layers: [
      {
        id: 'gsi-seamless-layer',
        type: 'raster',
        source: 'gsi-seamless',
        minzoom: 0,
        maxzoom: 18
      }
    ]
  };

  containerIds.forEach((id, index) => {
    const map = new maplibregl.Map({
      container: id,
      style: JSON.parse(JSON.stringify(baseMapStyle)), // ディープコピー
      center: [DEFAULT_LOC.lng, DEFAULT_LOC.lat],
      zoom: DEFAULT_LOC.zoom,
      pitch: DEFAULT_LOC.pitch,
      bearing: DEFAULT_LOC.bearing,
      attributionControl: false // クレジットはサイドバーで美しく表示
    });
    
    // ズーム・回転用標準コントロールの追加 (代表してマップ1のみに置くか、全マップに置くか)
    // 今回は画面UIの一体感のために右上部コントロールを1つ配置
    if (index === 0) {
      map.addControl(new maplibregl.NavigationControl({
        showCompass: false // コンパスは自作のプレミアムなものを使用
      }), 'top-right');
    }
    
    map.on('load', () => {
      // 標高タイルのプロトコルとソースの登録
      if (useGsiTerrainSource) {
        try {
          const gsiTerrainSource = useGsiTerrainSource(maplibregl.addProtocol);
          map.addSource('gsi-terrain', gsiTerrainSource);
          
          if (is3D) {
            map.setTerrain({ source: 'gsi-terrain', exaggeration: exaggeration });
          }
        } catch (e) {
          console.warn('3D Terrain source initialization failed:', e);
        }
      }
      
      // 各年代別空中写真のソースとレイヤーを追加
      ERAS.forEach((era) => {
        // ソース追加
        map.addSource(era.id, {
          type: 'raster',
          tiles: [era.url],
          tileSize: 256,
          attribution: `出典:国土地理院(${era.attribution})`,
          minzoom: era.minZoom,
          maxzoom: era.maxZoom
        });
        
        // レイヤー追加 (初期状態は非表示)
        map.addLayer({
          id: `${era.id}-layer`,
          type: 'raster',
          source: era.id,
          layout: {
            visibility: 'none'
          },
          paint: {
            'raster-opacity': 1,
            'raster-opacity-transition': { duration: 300 } // フェード効果
          }
        });
      });
      
      loadedCount++;
      if (loadedCount === containerIds.length) {
        // 全マップの初期読み込みが完了
        setTimeout(() => {
          setupMapSync();
          switchLayoutMode(activeLayout);
          updateEraLayers();
          updateCompass();
          updateShareUrl();
        }, 100);
      }
    });
    
    // 地図操作時に座標情報を更新
    map.on('move', () => {
      if (index === 0 || activeSyncMap === map) {
        const center = map.getCenter();
        const zoom = map.getZoom().toFixed(2);
        document.getElementById('coord-text').textContent = 
          `緯度: ${center.lat.toFixed(5)} 経度: ${center.lng.toFixed(5)} ズーム: ${zoom}`;
        
        updateCompass();
      }
    });
    
    map.on('moveend', () => {
      updateShareUrl();
    });
    
    // フライト地点設定用クリックイベント
    map.on('click', (e) => {
      if (isSettingStartPoint) {
        setFlightStartPoint([e.lngLat.lng, e.lngLat.lat]);
      } else if (isSettingGoalPoint) {
        setFlightGoalPoint([e.lngLat.lng, e.lngLat.lat]);
      }
    });

    maps.push(map);
  });
}

// --- 4. 地図同期制御 (Camera Synchronization) ---

function setupMapSync() {
  function onMove(e) {
    const sourceMap = e.target;
    
    // 同期処理の無限ループ防止
    if (isSyncing) return;
    if (activeSyncMap && activeSyncMap !== sourceMap) return;
    
    isSyncing = true;
    activeSyncMap = sourceMap;
    
    const center = sourceMap.getCenter();
    const zoom = sourceMap.getZoom();
    const pitch = sourceMap.getPitch();
    const bearing = sourceMap.getBearing();
    
    maps.forEach(m => {
      if (m !== sourceMap) {
        m.jumpTo({
          center: center,
          zoom: zoom,
          pitch: pitch,
          bearing: bearing
        });
      }
    });
    
    isSyncing = false;
    activeSyncMap = null;
  }
  
  maps.forEach(m => {
    m.on('move', onMove);
  });
}

// --- 5. レイアウト・モード切り替えロジック (Layout Management) ---

function switchLayoutMode(mode) {
  activeLayout = mode;
  
  // ボタンのアクティブ状態の変更
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  
  const workspace = document.getElementById('map-workspace');
  workspace.className = `layout-${mode}`;
  
  // 選択メニューやオーバーレイ、仕切りの表示調整
  const timelineOverlay = document.getElementById('timeline-overlay');
  const compSelects = document.getElementById('era-comparison-selects');
  const eraBadge = document.getElementById('era-info-badge');
  const swipeDivider = document.getElementById('swipe-divider');
  
  // 各ラベル要素の初期非表示
  document.getElementById('label-map-1').classList.add('hide');
  document.getElementById('label-map-2').classList.add('hide');
  document.getElementById('label-map-3').classList.add('hide');
  document.getElementById('label-map-4').classList.add('hide');
  
  if (mode === 'single') {
    timelineOverlay.classList.remove('hide');
    compSelects.classList.add('hide');
    eraBadge.classList.remove('hide');
    swipeDivider.classList.add('hide');
  } 
  else if (mode === 'swipe') {
    timelineOverlay.classList.add('hide'); // スライド比較時はタイムラインを隠す
    compSelects.classList.remove('hide');
    eraBadge.classList.add('hide');
    swipeDivider.classList.remove('hide');
    
    // スライドの初期位置
    updateSwipeClip();
    
    // ラベル設定
    document.getElementById('label-map-1').classList.remove('hide');
    document.getElementById('label-map-2').classList.remove('hide');
  } 
  else if (mode === 'split') {
    timelineOverlay.classList.add('hide');
    compSelects.classList.remove('hide');
    eraBadge.classList.add('hide');
    swipeDivider.classList.add('hide');
    
    // ラベル設定
    document.getElementById('label-map-1').classList.remove('hide');
    document.getElementById('label-map-2').classList.remove('hide');
  } 
  else if (mode === 'grid') {
    timelineOverlay.classList.add('hide');
    compSelects.classList.add('hide');
    eraBadge.classList.add('hide');
    swipeDivider.classList.add('hide');
    
    // ラベル設定
    document.getElementById('label-map-1').classList.remove('hide');
    document.getElementById('label-map-2').classList.remove('hide');
    document.getElementById('label-map-3').classList.remove('hide');
    document.getElementById('label-map-4').classList.remove('hide');
  }
  
  // 地図描画サイズの更新
  setTimeout(() => {
    maps.forEach(m => m.resize());
    updateEraLayers();
  }, 50);
  
  updateShareUrl();
}

// --- 6. 年代レイヤー表示更新ロジック (Era Layer Visibility) ---

function updateEraLayers() {
  if (maps.length < 4) return;
  
  // 一度全レイヤーを非表示にする共通関数
  const hideAllLayers = (map) => {
    ERAS.forEach(era => {
      map.setLayoutProperty(`${era.id}-layer`, 'visibility', 'none');
    });
  };
  
  // ベースレイヤーの可視性を切り替える関数
  const toggleBaseLayer = (map, showBase) => {
    if (map.getLayer('gsi-seamless-layer')) {
      map.setLayoutProperty('gsi-seamless-layer', 'visibility', showBase ? 'visible' : 'none');
    }
  };
  
  if (activeLayout === 'single') {
    const map = maps[0];
    hideAllLayers(map);
    toggleBaseLayer(map, true); // シングルモードでは常にベースを表示（操作性維持のため）
    map.setLayoutProperty(`${ERAS[currentEraIndex].id}-layer`, 'visibility', 'visible');
    map.setPaintProperty(`${ERAS[currentEraIndex].id}-layer`, 'raster-opacity', 1);
    
    // バッジ名更新
    document.getElementById('current-era-display-name').textContent = ERAS[currentEraIndex].name;
  } 
  else if (activeLayout === 'swipe') {
    // Map 1: Left Era
    hideAllLayers(maps[0]);
    toggleBaseLayer(maps[0], swipeLeftEraIndex === 8); // 現在(index 8)以外はベース非表示
    maps[0].setLayoutProperty(`${ERAS[swipeLeftEraIndex].id}-layer`, 'visibility', 'visible');
    maps[0].setPaintProperty(`${ERAS[swipeLeftEraIndex].id}-layer`, 'raster-opacity', 1);
    document.getElementById('label-map-1').textContent = `Before: ${ERAS[swipeLeftEraIndex].name.split('頃')[0].split('(')[0]}`;
    
    // Map 2: Right Era
    hideAllLayers(maps[1]);
    toggleBaseLayer(maps[1], swipeRightEraIndex === 8);
    maps[1].setLayoutProperty(`${ERAS[swipeRightEraIndex].id}-layer`, 'visibility', 'visible');
    maps[1].setPaintProperty(`${ERAS[swipeRightEraIndex].id}-layer`, 'raster-opacity', 1);
    document.getElementById('label-map-2').textContent = `After: ${ERAS[swipeRightEraIndex].name.split('頃')[0].split('(')[0]}`;
  } 
  else if (activeLayout === 'split') {
    // Map 1: Left Era
    hideAllLayers(maps[0]);
    toggleBaseLayer(maps[0], splitLeftEraIndex === 8);
    maps[0].setLayoutProperty(`${ERAS[splitLeftEraIndex].id}-layer`, 'visibility', 'visible');
    maps[0].setPaintProperty(`${ERAS[splitLeftEraIndex].id}-layer`, 'raster-opacity', 1);
    document.getElementById('label-map-1').textContent = `Before: ${ERAS[splitLeftEraIndex].name.split('頃')[0].split('(')[0]}`;
    
    // Map 2: Right Era
    hideAllLayers(maps[1]);
    toggleBaseLayer(maps[1], splitRightEraIndex === 8);
    maps[1].setLayoutProperty(`${ERAS[splitRightEraIndex].id}-layer`, 'visibility', 'visible');
    maps[1].setPaintProperty(`${ERAS[splitRightEraIndex].id}-layer`, 'raster-opacity', 1);
    document.getElementById('label-map-2').textContent = `After: ${ERAS[splitRightEraIndex].name.split('頃')[0].split('(')[0]}`;
  } 
  else if (activeLayout === 'grid') {
    // 4つの代表的な時代を表示
    const gridEras = [
      2, // 1945～1950年 (終戦直後)
      4, // 1974～1978年 (昭和40年代)
      7, // 1987～1990年 (平成初期)
      8  // 現在
    ];
    
    for (let i = 0; i < 4; i++) {
      hideAllLayers(maps[i]);
      const eraIdx = gridEras[i];
      toggleBaseLayer(maps[i], eraIdx === 8); // 過去の年代（0〜7）はベース非表示にして欠損時は空白表示
      
      maps[i].setLayoutProperty(`${ERAS[eraIdx].id}-layer`, 'visibility', 'visible');
      maps[i].setPaintProperty(`${ERAS[eraIdx].id}-layer`, 'raster-opacity', 1);
      
      const label = document.getElementById(`label-map-${i+1}`);
      label.textContent = ERAS[eraIdx].name.split('頃')[0].split('(')[0];
    }
  }
}

// タイムラインスライダー更新時の処理
function updateEraFromSlider(idx) {
  currentEraIndex = parseInt(idx);
  
  // タイムライン目盛りクラスの制御
  document.querySelectorAll('.timeline-tick-label').forEach((tick, tIdx) => {
    tick.classList.toggle('active', tIdx === currentEraIndex);
  });
  
  updateEraLayers();
  updateShareUrl();
}

// --- 7. スライド比較 (Swipe Divider) 制御 ---

function updateSwipeClip() {
  const wrapper = document.getElementById('map-wrapper-2');
  if (!wrapper) return;
  
  // 右側のマップを表示幅の swipePosition% から右側 100% までクリップ
  // CSS clip-path: inset(top right bottom left)
  // inset(0 0 0 swipePosition%) -> 左側から swipePosition% を切り落とし、右側を表示する
  wrapper.style.clipPath = `inset(0px 0px 0px ${swipePosition}%)`;
  
  // 仕切りの位置を更新
  const divider = document.getElementById('swipe-divider');
  if (divider) {
    divider.style.left = `${swipePosition}%`;
  }
}

// --- 8. 3D地形 (Terrain) 制御 ---

function toggle3D(enabled) {
  is3D = enabled;
  const settings = document.getElementById('terrain-settings');
  
  if (is3D) {
    settings.classList.remove('hide');
  } else {
    settings.classList.add('hide');
  }
  
  maps.forEach(map => {
    if (map.getSource('gsi-terrain')) {
      if (is3D) {
        map.setTerrain({ source: 'gsi-terrain', exaggeration: exaggeration });
      } else {
        map.setTerrain(null);
      }
    }
  });
  
  updateShareUrl();
}

function updateExaggeration(val) {
  exaggeration = parseFloat(val);
  document.getElementById('exaggeration-val').textContent = `${exaggeration.toFixed(1)}x`;
  
  if (is3D) {
    maps.forEach(map => {
      if (map.getSource('gsi-terrain')) {
        map.setTerrain({ source: 'gsi-terrain', exaggeration: exaggeration });
      }
    });
  }
}

// --- 9. 位置検索 (Geocoder Interface) ---

let searchTimeout = null;

async function handleSearchInput(e) {
  const query = e.target.value.trim();
  const clearBtn = document.getElementById('search-clear-btn');
  const suggestionsList = document.getElementById('search-suggestions');
  
  if (query.length > 0) {
    clearBtn.classList.remove('hide');
  } else {
    clearBtn.classList.add('hide');
    suggestionsList.classList.add('hide');
    return;
  }
  
  // キー入力の遅延処理 (Debounce)
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      const data = await res.json();
      
      renderSearchSuggestions(data);
    } catch (err) {
      console.error('Geocoding search failed:', err);
    }
  }, 300);
}

function renderSearchSuggestions(features) {
  const suggestionsList = document.getElementById('search-suggestions');
  suggestionsList.innerHTML = '';
  
  if (!features || features.length === 0) {
    suggestionsList.classList.add('hide');
    return;
  }
  
  suggestionsList.classList.remove('hide');
  
  // 最大8件表示
  features.slice(0, 8).forEach(feat => {
    const li = document.createElement('li');
    li.textContent = feat.properties.title;
    
    li.addEventListener('click', () => {
      const coords = feat.geometry.coordinates; // [lng, lat]
      flyAllMapsTo(coords[0], coords[1]);
      
      document.getElementById('search-input').value = feat.properties.title;
      suggestionsList.classList.add('hide');
    });
    
    suggestionsList.appendChild(li);
  });
}

function flyAllMapsTo(lng, lat, zoom = 15.5, pitch = null, bearing = null) {
  const mainMap = maps[0];
  const flightParams = {
    center: [lng, lat],
    zoom: zoom,
    essential: true,
    duration: 2500
  };
  
  if (pitch !== null) flightParams.pitch = pitch;
  if (bearing !== null) flightParams.bearing = bearing;
  
  mainMap.flyTo(flightParams);
}

// --- 10. フライトシミュレーション (Flight Simulator Engine) ---

function startFlightSetup(type) {
  if (isFlying) return;
  
  cancelFlightSetup(); // 初期状態クリア
  
  if (type === 'start') {
    isSettingStartPoint = true;
    document.getElementById('flight-start-input').placeholder = '◀ 地図上をクリックして設定...';
    document.getElementById('flight-start-input').focus();
    showToast('地図上をダブルクリックまたはクリックして、フライト開始位置を選択してください。');
  } else if (type === 'goal') {
    isSettingGoalPoint = true;
    document.getElementById('flight-goal-input').placeholder = '◀ 地図上をクリックして設定...';
    document.getElementById('flight-goal-input').focus();
    showToast('地図上をダブルクリックまたはクリックして、フライト目的地を選択してください。');
  }
}

function cancelFlightSetup() {
  isSettingStartPoint = false;
  isSettingGoalPoint = false;
  
  const startInput = document.getElementById('flight-start-input');
  const goalInput = document.getElementById('flight-goal-input');
  
  if (!flightStartPoint) startInput.placeholder = 'スタート地点 (マップクリック or 検索)';
  if (!flightGoalPoint) goalInput.placeholder = 'ゴール地点 (マップクリック or 検索)';
}

function setFlightStartPoint(coords) {
  flightStartPoint = coords;
  isSettingStartPoint = false;
  
  const startInput = document.getElementById('flight-start-input');
  startInput.value = `${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`;
  
  // マーカー表示
  if (flightStartMarker) flightStartMarker.remove();
  
  const el = document.createElement('div');
  el.className = 'dot start-dot';
  el.style.width = '16px';
  el.style.height = '16px';
  
  flightStartMarker = new maplibregl.Marker({ element: el })
    .setLngLat(coords)
    .addTo(maps[0]);
    
  checkFlightReady();
  showToast('スタート地点を設定しました。');
}

function setFlightGoalPoint(coords) {
  flightGoalPoint = coords;
  isSettingGoalPoint = false;
  
  const goalInput = document.getElementById('flight-goal-input');
  goalInput.value = `${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`;
  
  // マーカー表示
  if (flightGoalMarker) flightGoalMarker.remove();
  
  const el = document.createElement('div');
  el.className = 'dot goal-dot';
  el.style.width = '16px';
  el.style.height = '16px';
  
  flightGoalMarker = new maplibregl.Marker({ element: el })
    .setLngLat(coords)
    .addTo(maps[0]);
    
  checkFlightReady();
  showToast('ゴール地点を設定しました。');
}

function checkFlightReady() {
  const playBtn = document.getElementById('flight-play-btn');
  const resetBtn = document.getElementById('flight-reset-btn');
  
  if (flightStartPoint && flightGoalPoint) {
    playBtn.disabled = false;
    resetBtn.disabled = false;
  } else {
    playBtn.disabled = true;
    resetBtn.disabled = true;
  }
}

// プレミアムフライトアニメーションの実行部
async function runFlightSimulation() {
  if (isFlying || !flightStartPoint || !flightGoalPoint) return;
  
  isFlying = true;
  document.getElementById('flight-status-indicator').classList.remove('hide');
  document.getElementById('flight-status-text').textContent = 'ルート探索中...';
  document.getElementById('flight-play-btn').disabled = true;
  
  // パラメータ取得
  const speedIdx = parseInt(document.getElementById('flight-speed').value); // 1~5
  const zoomVal = parseFloat(document.getElementById('flight-altitude').value);
  const timeTravelEnabled = document.getElementById('flight-timetravel-toggle').checked;
  
  // 速度調整 (キロメートル毎秒をベースに設定)
  const speedFactors = [0.005, 0.01, 0.02, 0.04, 0.08]; // km/frame
  const kmPerFrame = speedFactors[speedIdx - 1];
  
  let line;
  try {
    // OpenStreetMapのOSRM APIを使用して道に沿ったルートを検索
    const startLngLat = `${flightStartPoint[0]},${flightStartPoint[1]}`;
    const goalLngLat = `${flightGoalPoint[0]},${flightGoalPoint[1]}`;
    const routeUrl = `https://router.project-osrm.org/route/v1/driving/${startLngLat};${goalLngLat}?overview=full&geometries=geojson`;
    
    // タイムアウト付きフェッチ (5秒で自動的に直線にフォールバック)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch(routeUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    const data = await res.json();
    
    if (data.code === 'Ok' && data.routes && data.routes.length > 0 && data.routes[0].geometry) {
      line = data.routes[0].geometry; // GeoJSON LineString
    } else {
      throw new Error('OSRM API returned non-OK code');
    }
  } catch (err) {
    console.warn('OSRM routing failed, falling back to straight-line path:', err);
    // 直線ルートにフォールバック
    line = turf.lineString([flightStartPoint, flightGoalPoint]);
  }
  
  const length = turf.length(line, { units: 'kilometers' });
  
  // 全ステップ数の決定
  const steps = Math.max(120, Math.floor(length / kmPerFrame));
  const route = [];
  for (let i = 0; i <= steps; i++) {
    const p = turf.along(line, (length * i) / steps, { units: 'kilometers' });
    route.push(p.geometry.coordinates);
  }
  
  // フライト中一時的に Single モードへ切り替える (最も適しているため)
  const savedLayout = activeLayout;
  if (activeLayout !== 'single') {
    switchLayoutMode('single');
  }
  
  // 飛行経路ラインを地図上に追加
  const mainMap = maps[0];
  const routeGeoJSON = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: route
    }
  };
  
  if (mainMap.getSource('flight-path-source')) {
    mainMap.getSource('flight-path-source').setData(routeGeoJSON);
  } else {
    mainMap.addSource('flight-path-source', { type: 'geojson', data: routeGeoJSON });
    mainMap.addLayer({
      id: 'flight-path-layer',
      type: 'line',
      source: 'flight-path-source',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#ec4899',
        'line-width': 4,
        'line-dasharray': [2, 2],
        'line-opacity': 0.8
      }
    });
  }
  
  let currentStep = 0;
  let startTime = null;
  const flightBearing = mainMap.getBearing(); // フライト開始時のカメラ方位を記録・固定
  
  // アニメーションフレーム更新関数
  function frame(timestamp) {
    if (!isFlying) return; // 途中で中断された場合
    
    if (currentStep >= steps) {
      endFlight(savedLayout);
      return;
    }
    
    const currentCoords = route[currentStep];
    const progress = currentStep / steps; // 0.0 ~ 1.0
    
    // カメラ回転方位は開始時の向きに固定
    const nextBearing = flightBearing;
    
    // カメラ傾斜 (ピッチ) のダイナミックな変化
    // 中間で最も傾き、離着陸(スタート/ゴール)でやや起きる演出
    // パラメータ：30° からスタートし、途中で 65° まで傾け、着陸時に 30° に戻す
    const targetPitch = 30 + Math.sin(progress * Math.PI) * 35;
    
    // ズーム（高度）の放物線変化 (U字型: スタートとゴールは低空、中間はやや引き俯瞰)
    // 中間での引き：最大 1.5 ズームレベル下げる
    const currentZoom = zoomVal - Math.sin(progress * Math.PI) * 1.2;
    
    // カメラ移動
    mainMap.jumpTo({
      center: currentCoords,
      zoom: currentZoom,
      pitch: targetPitch,
      bearing: nextBearing
    });
    
    // --- タイムトラベル（クロスフェード）の計算 ---
    if (timeTravelEnabled) {
      // 9つの年代を progress (0~1) に応じて滑らかに配分
      const floatIndex = progress * (ERAS.length - 1);
      const eraIdx1 = Math.floor(floatIndex);
      const eraIdx2 = Math.min(eraIdx1 + 1, ERAS.length - 1);
      const ratio = floatIndex - eraIdx1; // 0.0 ~ 1.0
      
      // レイヤーの可視化と透明度の設定
      ERAS.forEach((era, idx) => {
        if (idx === eraIdx1) {
          mainMap.setLayoutProperty(`${era.id}-layer`, 'visibility', 'visible');
          mainMap.setPaintProperty(`${era.id}-layer`, 'raster-opacity', 1 - ratio);
        } else if (idx === eraIdx2) {
          mainMap.setLayoutProperty(`${era.id}-layer`, 'visibility', 'visible');
          mainMap.setPaintProperty(`${era.id}-layer`, 'raster-opacity', ratio);
        } else {
          mainMap.setLayoutProperty(`${era.id}-layer`, 'visibility', 'none');
        }
      });
      
      // 表示名バッジの更新 (2つのブレンドを％表記などするとプレミアム感が出ます)
      const name1 = ERAS[eraIdx1].name.split('頃')[0].split('(')[0];
      const name2 = ERAS[eraIdx2].name.split('頃')[0].split('(')[0];
      let displayName = name1;
      if (ratio > 0.15 && ratio < 0.85) {
        displayName = `${name1} ➔ ${name2}`;
      } else if (ratio >= 0.85) {
        displayName = name2;
      }
      document.getElementById('current-era-display-name').textContent = displayName;
      
      // タイムラインスライダー値も同期して滑らかに動かす
      document.getElementById('timeline-slider').value = Math.round(floatIndex);
      document.querySelectorAll('.timeline-tick-label').forEach((tick, tIdx) => {
        tick.classList.toggle('active', tIdx === Math.round(floatIndex));
      });
    }
    
    // 進捗テキスト更新
    const percent = Math.round(progress * 100);
    document.getElementById('flight-status-text').textContent = `タイムフライト中: ${percent}%`;
    
    currentStep++;
    flightAnimationId = requestAnimationFrame(frame);
  }
  
  flightAnimationId = requestAnimationFrame(frame);
}

// フライト強制中断
function abortFlight() {
  if (!isFlying) return;
  isFlying = false;
  
  if (flightAnimationId) {
    cancelAnimationFrame(flightAnimationId);
  }
  
  // 状態の復帰
  document.getElementById('flight-status-indicator').classList.add('hide');
  document.getElementById('flight-play-btn').disabled = false;
  
  showToast('フライトを中断しました。');
  
  // 最終的な描画更新
  updateEraLayers();
}

function endFlight(savedLayout) {
  isFlying = false;
  document.getElementById('flight-status-indicator').classList.add('hide');
  document.getElementById('flight-play-btn').disabled = false;
  
  // 最後の目的地座標へ正確に位置合わせ
  maps[0].flyTo({
    center: flightGoalPoint,
    zoom: parseFloat(document.getElementById('flight-altitude').value),
    pitch: 30,
    bearing: 0,
    duration: 1500
  });
  
  // 年代を「現在」にする
  currentEraIndex = ERAS.length - 1;
  document.getElementById('timeline-slider').value = currentEraIndex;
  
  // 元の表示レイアウトに戻す
  switchLayoutMode(savedLayout);
  
  showToast('目的地に到着しました。');
}

function resetFlight() {
  abortFlight();
  
  flightStartPoint = null;
  flightGoalPoint = null;
  
  if (flightStartMarker) { flightStartMarker.remove(); flightStartMarker = null; }
  if (flightGoalMarker) { flightGoalMarker.remove(); flightGoalMarker = null; }
  
  // ルート線削除
  const mainMap = maps[0];
  if (mainMap.getLayer('flight-path-layer')) mainMap.removeLayer('flight-path-layer');
  if (mainMap.getSource('flight-path-source')) mainMap.removeSource('flight-path-source');
  
  document.getElementById('flight-start-input').value = '';
  document.getElementById('flight-goal-input').value = '';
  
  cancelFlightSetup();
  checkFlightReady();
  
  showToast('フライト設定をリセットしました。');
}

// --- 11. 共有機能と URL パラメータ (URL Synchronization) ---

function updateShareUrl() {
  if (maps.length === 0) return;
  
  const mainMap = maps[0];
  const center = mainMap.getCenter();
  const zoom = mainMap.getZoom().toFixed(4);
  const pitch = mainMap.getPitch().toFixed(1);
  const bearing = mainMap.getBearing().toFixed(1);
  
  const params = new URLSearchParams();
  params.set('lat', center.lat.toFixed(6));
  params.set('lng', center.lng.toFixed(6));
  params.set('zoom', zoom);
  params.set('pitch', pitch);
  params.set('bearing', bearing);
  params.set('mode', activeLayout);
  params.set('era', currentEraIndex);
  params.set('3d', is3D ? '1' : '0');
  params.set('exag', exaggeration.toFixed(1));
  params.set('el', swipeLeftEraIndex);
  params.set('er', swipeRightEraIndex);
  params.set('spl', splitLeftEraIndex);
  params.set('spr', splitRightEraIndex);
  
  const newUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  
  const shareInput = document.getElementById('share-url-input');
  if (shareInput) {
    shareInput.value = newUrl;
  }
}

function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  
  // 各種設定値の読み込み (クエリにあれば上書き)
  if (params.has('mode')) activeLayout = params.get('mode');
  if (params.has('era')) currentEraIndex = parseInt(params.get('era'));
  if (params.has('3d')) is3D = params.get('3d') === '1';
  if (params.has('exag')) exaggeration = parseFloat(params.get('exag'));
  
  if (params.has('el')) swipeLeftEraIndex = parseInt(params.get('el'));
  if (params.has('er')) swipeRightEraIndex = parseInt(params.get('er'));
  if (params.has('spl')) splitLeftEraIndex = parseInt(params.get('spl'));
  if (params.has('spr')) splitRightEraIndex = parseInt(params.get('spr'));
  
  // 位置情報のカスタム読み込み
  if (params.has('lat') && params.has('lng')) {
    DEFAULT_LOC.lat = parseFloat(params.get('lat'));
    DEFAULT_LOC.lng = parseFloat(params.get('lng'));
  }
  if (params.has('zoom')) DEFAULT_LOC.zoom = parseFloat(params.get('zoom'));
  if (params.has('pitch')) DEFAULT_LOC.pitch = parseFloat(params.get('pitch'));
  if (params.has('bearing')) DEFAULT_LOC.bearing = parseFloat(params.get('bearing'));
}

function copyShareUrl() {
  const urlInput = document.getElementById('share-url-input');
  urlInput.select();
  urlInput.setSelectionRange(0, 99999); // モバイル対応
  
  navigator.clipboard.writeText(urlInput.value)
    .then(() => {
      showToast('共有用URLをクリップボードにコピーしました！');
    })
    .catch(err => {
      console.error('Failed to copy text: ', err);
    });
}

// --- 12. コンパス・ウィジェット制御 ---

function updateCompass() {
  const compass = document.getElementById('compass-icon');
  if (!compass || maps.length === 0) return;
  
  const bearing = maps[0].getBearing();
  
  // アイコン自体を回転させる
  compass.style.transform = `rotate(${-bearing}deg)`;
}

function resetBearing() {
  if (maps.length === 0) return;
  maps[0].easeTo({
    bearing: 0,
    pitch: activeLayout === 'grid' ? 0 : maps[0].getPitch(), // 必要に応じてピッチも直す
    duration: 1000
  });
}

// --- 13. トースト・ポップアップ通知 (Toast UI) ---

let toastTimeout = null;

function showToast(message) {
  const toast = document.getElementById('toast-notification');
  const msgEl = document.getElementById('toast-message');
  
  msgEl.textContent = message;
  toast.classList.remove('hide');
  
  // 一度リセットして表示トリガー
  toast.classList.remove('show');
  void toast.offsetWidth; // リフロー発生
  toast.classList.add('show');
  
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// --- 14. タイムライン自動再生制御 (Auto Playback Loop) ---

function toggleTimelinePlayback() {
  const btn = document.getElementById('timeline-play-btn');
  const icon = btn.querySelector('i');
  
  if (playbackInterval) {
    // 再生停止
    clearInterval(playbackInterval);
    playbackInterval = null;
    icon.className = 'fa-solid fa-play';
    showToast('タイムラインの自動再生を停止しました。');
  } else {
    // 再生開始
    icon.className = 'fa-solid fa-pause';
    showToast('タイムラインの自動再生を開始しました。');
    
    playbackInterval = setInterval(() => {
      let nextIndex = currentEraIndex + 1;
      if (nextIndex >= ERAS.length) {
        nextIndex = 0; // ループ
      }
      
      const slider = document.getElementById('timeline-slider');
      slider.value = nextIndex;
      updateEraFromSlider(nextIndex);
    }, playbackSpeed);
  }
}

// --- 15. イベントリスナー定義 (Event Bindings) ---

function bindEvents() {
  
  // モード切り替えボタン
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isFlying) return;
      switchLayoutMode(btn.dataset.mode);
    });
  });
  
  // 年代比較セレクトボックス
  document.getElementById('era-left-select').addEventListener('change', (e) => {
    const val = parseInt(e.target.value);
    if (activeLayout === 'swipe') {
      swipeLeftEraIndex = val;
    } else {
      splitLeftEraIndex = val;
    }
    updateEraLayers();
    updateShareUrl();
  });
  
  document.getElementById('era-right-select').addEventListener('change', (e) => {
    const val = parseInt(e.target.value);
    if (activeLayout === 'swipe') {
      swipeRightEraIndex = val;
    } else {
      splitRightEraIndex = val;
    }
    updateEraLayers();
    updateShareUrl();
  });
  
  // 3D地形トグル
  document.getElementById('terrain-toggle').addEventListener('change', (e) => {
    toggle3D(e.target.checked);
  });
  
  // 起伏強調度
  document.getElementById('terrain-exaggeration').addEventListener('input', (e) => {
    updateExaggeration(e.target.value);
  });
  
  // カメラピッチ・方位スライダー
  const pitchSlider = document.getElementById('map-pitch');
  pitchSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('pitch-val').textContent = `${val}°`;
    
    if (maps.length > 0) {
      maps[0].setPitch(val);
    }
  });
  
  const bearingSlider = document.getElementById('map-bearing');
  bearingSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('bearing-val').textContent = `${val}°`;
    
    if (maps.length > 0) {
      maps[0].setBearing(val);
    }
  });
  
  // 位置検索
  document.getElementById('search-input').addEventListener('input', handleSearchInput);
  document.getElementById('search-clear-btn').addEventListener('click', () => {
    const input = document.getElementById('search-input');
    input.value = '';
    document.getElementById('search-clear-btn').classList.add('hide');
    document.getElementById('search-suggestions').classList.add('hide');
    input.focus();
  });
  
  // プリセットタグ
  document.querySelectorAll('.preset-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      if (isFlying) return;
      const lng = parseFloat(tag.dataset.lng);
      const lat = parseFloat(tag.dataset.lat);
      const zoom = parseFloat(tag.dataset.zoom);
      const pitch = parseFloat(tag.dataset.pitch);
      
      // ピッチとスライダーを同期
      document.getElementById('map-pitch').value = pitch;
      document.getElementById('pitch-val').textContent = `${pitch}°`;
      
      flyAllMapsTo(lng, lat, zoom, pitch, 0);
    });
  });
  
  // スワイプ仕切りのドラッグイベント設定 (マウス & タッチ対応)
  const divider = document.getElementById('swipe-divider');
  let isDragging = false;
  
  const startDrag = () => { isDragging = true; };
  const stopDrag = () => { isDragging = false; };
  
  const dragMove = (clientX) => {
    if (!isDragging) return;
    const workspace = document.getElementById('map-workspace');
    const rect = workspace.getBoundingClientRect();
    
    // 横位置比率の計算 (0%~100%)
    let pct = ((clientX - rect.left) / rect.width) * 100;
    pct = Math.max(0, Math.min(100, pct)); // 範囲制限
    
    swipePosition = pct;
    updateSwipeClip();
  };
  
  divider.addEventListener('mousedown', startDrag);
  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('mousemove', (e) => dragMove(e.clientX));
  
  divider.addEventListener('touchstart', startDrag);
  window.addEventListener('touchend', stopDrag);
  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      dragMove(e.touches[0].clientX);
    }
  });
  
  // フライトシミュレータボタン
  document.getElementById('set-start-btn').addEventListener('click', () => startFlightSetup('start'));
  document.getElementById('set-goal-btn').addEventListener('click', () => startFlightSetup('goal'));
  document.getElementById('flight-play-btn').addEventListener('click', runFlightSimulation);
  document.getElementById('flight-abort-btn').addEventListener('click', abortFlight);
  document.getElementById('flight-reset-btn').addEventListener('click', resetFlight);
  
  // スライダー高度 / スピード値バッジ同期
  document.getElementById('flight-altitude').addEventListener('input', (e) => {
    document.getElementById('flight-zoom-val').textContent = parseFloat(e.target.value).toFixed(1);
  });
  
  const speedLabels = ['超低速', '低速', '標準', '高速', '超高速'];
  document.getElementById('flight-speed').addEventListener('input', (e) => {
    document.getElementById('flight-speed-val').textContent = speedLabels[parseInt(e.target.value) - 1];
  });
  
  // コピー共有
  document.getElementById('share-copy-btn').addEventListener('click', copyShareUrl);
  
  // コンパス回転リセット
  document.getElementById('compass-widget').addEventListener('click', resetBearing);
  
  // タイムラインコントローラ
  document.getElementById('timeline-play-btn').addEventListener('click', toggleTimelinePlayback);
  document.getElementById('timeline-slider').addEventListener('input', (e) => {
    if (isFlying) return;
    updateEraFromSlider(e.target.value);
  });
  
  document.getElementById('timeline-prev-btn').addEventListener('click', () => {
    if (isFlying) return;
    let idx = currentEraIndex - 1;
    if (idx < 0) idx = ERAS.length - 1;
    document.getElementById('timeline-slider').value = idx;
    updateEraFromSlider(idx);
  });
  
  document.getElementById('timeline-next-btn').addEventListener('click', () => {
    if (isFlying) return;
    let idx = currentEraIndex + 1;
    if (idx >= ERAS.length) idx = 0;
    document.getElementById('timeline-slider').value = idx;
    updateEraFromSlider(idx);
  });
  
  document.getElementById('timeline-speed-select').addEventListener('change', (e) => {
    playbackSpeed = parseInt(e.target.value);
    // すでに再生中の場合はタイマーをリセット
    if (playbackInterval) {
      clearInterval(playbackInterval);
      playbackInterval = setInterval(() => {
        let nextIndex = currentEraIndex + 1;
        if (nextIndex >= ERAS.length) nextIndex = 0;
        document.getElementById('timeline-slider').value = nextIndex;
        updateEraFromSlider(nextIndex);
      }, playbackSpeed);
    }
  });
  
  // サイドバー開閉（レスポンシブ／フルスクリーン用）
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    
    // 地図のサイズを遅延再計算
    setTimeout(() => {
      maps.forEach(m => m.resize());
    }, 300);
  });
  
  // 地図の再同期（サイズ変更等に備える）
  window.addEventListener('resize', () => {
    maps.forEach(m => m.resize());
  });
}
