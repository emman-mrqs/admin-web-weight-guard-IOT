document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('showroom-canvas');
    const modelNameEl = document.getElementById('model-name');
    const modelClassEl = document.getElementById('model-class');
    const typeInput = document.getElementById('vehicle-type-input');
    const capacitySlider = document.getElementById('capacity-slider');
    const capacityDisplay = document.getElementById('capacity-display');

    capacitySlider.addEventListener('input', (e) => {
        capacityDisplay.textContent = parseInt(e.target.value).toLocaleString() + ' kg';
    });

    // --- THREE.JS SETUP ---
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020617, 0.015);

    const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(12, 8, -12); 

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.physicallyCorrectLights = true;
    container.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; 
    controls.target.set(-2, 0, 0); 

    // --- LIGHTING ---
// --- STUDIO LIGHTING (Upgraded for solid models) ---
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5); 
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.5); 
    mainLight.position.set(10, 20, 10);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const backLight = new THREE.DirectionalLight(0x34d399, 1.0); 
    backLight.position.set(-10, 10, -10);
    scene.add(backLight);

    // Grid Floor
    const gridHelper = new THREE.GridHelper(30, 30, 0x1e293b, 0x0f172a);
    gridHelper.position.set(-2, -0.5, 0); 
    scene.add(gridHelper);

    // --- GLTF LOADER LOGIC ---
    const loader = new THREE.GLTFLoader();

    let currentTruckObj = null;

    // Define your models (You can add more .glb files to this array later)
    const models = [
        { 
            id: 'trailer-truck', 
            name: 'Trailer Truck',
            class: 'Class 8 Heavy Duty', 
            // Semi-truck / tractor trailer used for long-haul freight
            filePath: '/uploads/trucks/TrailerTruck.glb' 
        },
        { 
            id: 'flatbed-truck', 
            name: 'Flatbed Truck', 
            class: 'Class 7–8 Heavy Duty', 
            // Heavy cargo truck often used for construction materials
            filePath: '/uploads/trucks/FlatbedTruck.glb' 
        },
        { 
            id: 'reefer-truck', 
            name: 'Reefer Box Truck',
            class: 'Class 6–7 Medium Duty', 
            // Refrigerated delivery truck for food/pharma transport
            filePath: '/uploads/trucks/ReeferTruck.glb' 
        },
        { 
            id: 'small-truck', 
            name: 'Small Truck',
            class: 'Class 3–4 Light/Medium Duty', 
            // Small commercial delivery truck
            filePath: '/uploads/trucks/SmallTruck.glb' 
        },
    ];
    let currentIndex = 0;

    function loadModel(index) {
        if (currentTruckObj) scene.remove(currentTruckObj);

        const modelData = models[index];
        
        // Update UI
        modelNameEl.textContent = modelData.name;
        modelClassEl.textContent = modelData.class;
        typeInput.value = modelData.id;

        // Load the actual .glb file
        loader.load(
            modelData.filePath,
            function (gltf) {
                currentTruckObj = gltf.scene;
                
                // Enable shadows on all mesh parts, keep original GLB materials
                currentTruckObj.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                // 2. Auto-Scale & Center the model
                // This ensures the truck isn't 100x too big or 100x too small
                const box = new THREE.Box3().setFromObject(currentTruckObj);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                
                // We want the truck to be roughly 8 units long in our 3D world
                const scale = 8 / maxDim;
                currentTruckObj.scale.set(scale, scale, scale);

                // 3. Position it nicely on the left side of the screen over the grid
                currentTruckObj.position.set(-2, -0.5, 0);
                
                // Adjust Y position so the tires perfectly touch the ground grid
                const newBox = new THREE.Box3().setFromObject(currentTruckObj);
                currentTruckObj.position.y -= (newBox.min.y + 0.5);

                scene.add(currentTruckObj);
            },
            undefined, // We can skip the progress function
            function (error) {
                console.error('Error loading the 3D model:', error);
            }
        );
    }

    // Controls for the bottom selector
    document.getElementById('next-model').addEventListener('click', () => {
        currentIndex = (currentIndex + 1) % models.length;
        loadModel(currentIndex);
    });
    document.getElementById('prev-model').addEventListener('click', () => {
        currentIndex = (currentIndex - 1 + models.length) % models.length;
        loadModel(currentIndex);
    });

    // Initialize first model
    loadModel(0);

    // --- ANIMATION LOOP ---
    let time = 0;
    function animate() {
        requestAnimationFrame(animate);
        
        time += 0.01;
        if (currentTruckObj) {
            // Very slow, premium rotation
            currentTruckObj.rotation.y += 0.002; 
            // Slight hover effect on the chassis
            currentTruckObj.position.y += Math.sin(time) * 0.001; 
        }

        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    // Handle Window Resize
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
});