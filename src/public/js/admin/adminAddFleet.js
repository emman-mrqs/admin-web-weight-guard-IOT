document.addEventListener('DOMContentLoaded', () => {

    /* ==========================================================================
       1. DOM ELEMENTS & UI SETUP
       ========================================================================== */
    const container = document.getElementById('showroom-canvas');
    const modelNameEl = document.getElementById('model-name');
    const modelClassEl = document.getElementById('model-class');
    const typeInput = document.getElementById('vehicle-type-input');
    const capacitySlider = document.getElementById('capacity-slider');
    const capacityDisplay = document.getElementById('capacity-display');

    // Update capacity text when slider moves
    capacitySlider.addEventListener('input', (e) => {
        capacityDisplay.textContent = parseInt(e.target.value).toLocaleString() + ' kg';
    });


    /* ==========================================================================
       2. THREE.JS SCENE INITIALIZATION
       ========================================================================== */
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020617, 0.015); // Adds deep blue fog fading into background

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
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent camera from going below ground
    controls.target.set(-2, 0, 0); 


    /* ==========================================================================
       3. LIGHTING & ENVIRONMENT
       ========================================================================== */
    // --- STUDIO LIGHTING (Upgraded for solid models) ---
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5); 
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.5); 
    mainLight.position.set(10, 20, 10);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const backLight = new THREE.DirectionalLight(0x34d399, 1.0); // Emerald green back-glow
    backLight.position.set(-10, 10, -10);
    scene.add(backLight);

    // Grid Floor
    const gridHelper = new THREE.GridHelper(30, 30, 0x1e293b, 0x0f172a);
    gridHelper.position.set(-2, -0.5, 0); 
    scene.add(gridHelper);


    /* ==========================================================================
       4. 3D MODEL CONFIGURATION
       ========================================================================== */
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
    
    let currentTruckObj = null;
    let currentIndex = 0;


    /* ==========================================================================
       5. GLTF LOADER LOGIC
       ========================================================================== */
    const loader = new THREE.GLTFLoader();

    function loadModel(index) {
        // Remove previous truck before loading the new one
        if (currentTruckObj) scene.remove(currentTruckObj);

        const modelData = models[index];
        
        // Update UI Text
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

                // Auto-Scale & Center the model
                // This ensures the truck isn't 100x too big or 100x too small
                const box = new THREE.Box3().setFromObject(currentTruckObj);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                
                // We want the truck to be roughly 8 units long in our 3D world
                const scale = 8 / maxDim;
                currentTruckObj.scale.set(scale, scale, scale);

                // Position it nicely on the left side of the screen over the grid
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


    /* ==========================================================================
       6. UI EVENT LISTENERS
       ========================================================================== */
    // Controls for the bottom selector
    document.getElementById('next-model').addEventListener('click', () => {
        currentIndex = (currentIndex + 1) % models.length;
        loadModel(currentIndex);
    });
    
    document.getElementById('prev-model').addEventListener('click', () => {
        currentIndex = (currentIndex - 1 + models.length) % models.length;
        loadModel(currentIndex);
    });

    // Initialize first model on load
    loadModel(0);


    /* ==========================================================================
       7. ANIMATION LOOP & RESIZE HANDLER
       ========================================================================== */
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

    // Handle Window Resize to keep aspect ratio perfect
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    initializeAddFleetForm();
});

function normalizeVehicleType(typeId) {
    const typeMap = {
        'trailer-truck': 'Trailer Truck',
        'flatbed-truck': 'Flatbed Truck',
        'reefer-truck': 'Reefer Box Truck',
        'small-truck': 'Small Truck',
        'box-truck': 'Box Truck'
    };

    return typeMap[typeId] || String(typeId || '').trim();
}

function ensureFormFeedback(form) {
    if (!form) return null;

    let feedback = form.querySelector('[data-role="fleet-form-feedback"]');
    if (feedback) return feedback;

    feedback = document.createElement('div');
    feedback.setAttribute('data-role', 'fleet-form-feedback');
    feedback.className = 'hidden rounded-xl border px-4 py-3 text-sm font-medium';
    form.insertBefore(feedback, form.firstChild.nextSibling);
    return feedback;
}

function showFormFeedback(form, type, message) {
    const feedback = ensureFormFeedback(form);
    if (!feedback) return;

    feedback.textContent = message || '';
    feedback.classList.remove('hidden', 'border-emerald-700', 'bg-emerald-950/60', 'text-emerald-300', 'border-rose-700', 'bg-rose-950/60', 'text-rose-300');

    if (type === 'success') {
        feedback.classList.add('border-emerald-700', 'bg-emerald-950/60', 'text-emerald-300');
        return;
    }

    feedback.classList.add('border-rose-700', 'bg-rose-950/60', 'text-rose-300');
}

function clearFormFeedback(form) {
    const feedback = form?.querySelector('[data-role="fleet-form-feedback"]');
    if (!feedback) return;

    feedback.textContent = '';
    feedback.classList.add('hidden');
}

function ensureInlineErrorElement(inputElement, fieldName) {
    if (!inputElement) return null;

    const existing = inputElement.parentElement.querySelector(`.inline-error[data-field="${fieldName}"]`);
    if (existing) return existing;

    const errorDiv = document.createElement('div');
    errorDiv.className = 'inline-error hidden mt-2 text-xs font-medium text-rose-400';
    errorDiv.setAttribute('data-field', fieldName);
    inputElement.parentElement.appendChild(errorDiv);
    return errorDiv;
}

function clearInlineErrors(form) {
    if (!form) return;

    form.querySelectorAll('.inline-error').forEach((el) => {
        el.textContent = '';
        el.classList.add('hidden');
    });
}

function renderInlineErrors(form, fieldErrors) {
    if (!form || !fieldErrors) return;

    Object.entries(fieldErrors).forEach(([field, message]) => {
        const input = form.querySelector(`[name="${field}"]`);
        const errorEl = ensureInlineErrorElement(input, field);
        if (errorEl) {
            errorEl.textContent = String(message || 'Invalid value.');
            errorEl.classList.remove('hidden');
        }
    });
}

function setSubmitLoading(button, isLoading) {
    if (!button) return;

    if (isLoading) {
        button.dataset.originalText = button.innerHTML;
        button.disabled = true;
        button.classList.add('opacity-70', 'cursor-not-allowed');
        button.innerHTML = 'Registering...';
        return;
    }

    button.disabled = false;
    button.classList.remove('opacity-70', 'cursor-not-allowed');
    if (button.dataset.originalText) {
        button.innerHTML = button.dataset.originalText;
    }
}

async function loadAssignableDrivers() {
    const select = document.querySelector('#fleetAddForm select[name="driverId"]');
    if (!select) return;

    try {
        const response = await fetch('/api/admin/fleet/assignable-drivers', {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        const payload = await response.json();

        if (!response.ok) {
            console.error('Failed to fetch assignable drivers:', payload);
            return;
        }

        select.innerHTML = '';

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- Leave Unassigned --';
        select.appendChild(defaultOption);

        (payload.data || []).forEach((driver) => {
            const option = document.createElement('option');
            option.value = String(driver.id);
            option.textContent = `${driver.first_name} ${driver.last_name}`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading assignable drivers:', error);
    }
}

async function handleAddFleetSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const submitButton = document.querySelector('button[form="fleetAddForm"]');
    clearInlineErrors(form);
    clearFormFeedback(form);

    const vehicleTypeRaw = form.querySelector('input[name="vehicleType"]')?.value;
    const plateNumber = form.querySelector('input[name="plateNumber"]')?.value?.trim();
    const maxCapacity = form.querySelector('input[name="maxCapacity"]')?.value;
    const driverId = form.querySelector('select[name="driverId"]')?.value;

    setSubmitLoading(submitButton, true);

    try {
        const response = await fetch('/admin/fleet/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                vehicleType: normalizeVehicleType(vehicleTypeRaw),
                plateNumber,
                maxCapacity,
                driverId: driverId || null
            })
        });

        const payload = await response.json();

        if (!response.ok) {
            renderInlineErrors(form, payload.fieldErrors || {});
            showFormFeedback(form, 'error', payload.error || 'Failed to register vehicle.');
            return;
        }

        form.reset();
        const typeInput = form.querySelector('input[name="vehicleType"]');
        if (typeInput) {
            typeInput.value = 'box-truck';
        }
        const capacityDisplay = document.getElementById('capacity-display');
        if (capacityDisplay) {
            capacityDisplay.textContent = '12,000 kg';
        }
        await loadAssignableDrivers();
        showFormFeedback(form, 'success', payload.message || 'Vehicle added successfully.');
        setTimeout(() => {
            clearFormFeedback(form);
        }, 3500);
    } catch (error) {
        console.error('Error creating vehicle:', error);
        showFormFeedback(form, 'error', 'Network error while adding vehicle. Please try again.');
    } finally {
        setSubmitLoading(submitButton, false);
    }
}

function initializeAddFleetForm() {
    const form = document.getElementById('fleetAddForm');
    if (!form) return;

    form.addEventListener('submit', handleAddFleetSubmit);
    loadAssignableDrivers();
}