{ pkgs ? import <nixpkgs> {} }:

let
  electron = pkgs.electron;
in
pkgs.buildNpmPackage rec {
  pname = "4e-dm-dashboard";
  version = "0.1.0";

  src = pkgs.lib.cleanSourceWith {
    src = ./.;
    filter = path: type:
      let baseName = builtins.baseNameOf path; in
      # Exclude large non-source directories and stray files from the build
      !(baseName == "4eBooks" ||
        baseName == "combat-debug.log" ||
        baseName == "result" ||
        (type == "regular" && builtins.match ".*\\.(webp|png|jpg)$" baseName != null &&
         builtins.dirOf path == toString ./.));
  };

  # To get the correct hash:
  #   1. Set this to pkgs.lib.fakeHash
  #   2. Run `nix-build`
  #   3. The build will fail and print the correct hash
  #   4. Replace the hash below with the printed one
  npmDepsHash = "sha256-bdrWgZz0PlIpjQSQLifrwk5CXbk1FYfVLm+6UjdfcfU=";

  # We use the system electron at runtime — skip downloading the npm binary
  env.ELECTRON_SKIP_BINARY_DOWNLOAD = "1";

  nativeBuildInputs = with pkgs; [
    makeWrapper
    librsvg    # rsvg-convert for SVG → PNG icon
  ];

  # Override the default npm build to use electron-vite explicitly
  dontNpmBuild = true;
  buildPhase = ''
    runHook preBuild
    npx electron-vite build
    runHook postBuild
  '';

  # Override default install (npm pack) with our electron-specific layout
  installPhase = ''
    runHook preInstall

    # Application files — only the built output + package.json + runtime deps
    mkdir -p $out/lib/${pname}/node_modules
    cp -r out $out/lib/${pname}/
    cp package.json $out/lib/${pname}/

    # Copy only runtime node_modules (nanoid is the sole external require)
    cp -r node_modules/nanoid $out/lib/${pname}/node_modules/

    # 4e compendium data — loaded at runtime via readFileSync relative to app.getAppPath()
    mkdir -p $out/lib/${pname}/content
    cp -r content/parsed $out/lib/${pname}/content/

    # Wrapper: runs system electron pointed at our app directory.
    # ''${NIXOS_OZONE_WL} expands at runtime to --ozone-platform=wayland on
    # Wayland sessions (set automatically by NixOS).
    mkdir -p $out/bin
    makeWrapper ${electron}/bin/electron $out/bin/${pname} \
      --add-flags "''${NIXOS_OZONE_WL}" \
      --add-flags "$out/lib/${pname}"

    # .desktop file for Tofi/Rofi
    mkdir -p $out/share/applications
    cp ${pname}.desktop $out/share/applications/

    # App icon (SVG → 256x256 PNG)
    mkdir -p $out/share/icons/hicolor/256x256/apps
    rsvg-convert -w 256 -h 256 resources/icon.svg \
      -o $out/share/icons/hicolor/256x256/apps/${pname}.png

    runHook postInstall
  '';

  meta = with pkgs.lib; {
    description = "DM toolkit for D&D 4th Edition";
    license = licenses.gpl3Only;
    platforms = platforms.linux;
    mainProgram = "4e-dm-dashboard";
  };
}
