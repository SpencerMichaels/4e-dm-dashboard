{
  description = "4e DM Dashboard: project-local toolchain and package";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  # The package build needs vendor/4e-kit.
  inputs.self.submodules = true;

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      # Keep in step with the "electron" devDependency in package.json.
      electron = pkgs.electron_43;
    in {
      packages.${system}.default = pkgs.callPackage ./default.nix { inherit pkgs electron; };

      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          electron
          git
          jq
          librsvg
          nodejs_22
          poppler-utils
          ripgrep
        ];

        # npm's electron package ships a generic Linux binary that can't run on
        # NixOS. Skip downloading it and point the package at nixpkgs' build,
        # so `electron` and `electron-vite` from node_modules run that one.
        ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
        ELECTRON_OVERRIDE_DIST_PATH = "${electron}/bin";
        NODE_OPTIONS = "--max-old-space-size=4096";
      };
    };
}
