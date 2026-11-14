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
          git-filter-repo
          jq
          librsvg
          nodejs_22
          poppler-utils
          ripgrep
        ];

        # npm's electron package downloads a generic Linux binary (and its
        # electron.d.ts) that can't run on NixOS. Run nixpkgs' build instead:
        # the `electron` launcher in node_modules reads the first variable,
        # electron-vite (dev, preview) the second.
        ELECTRON_OVERRIDE_DIST_PATH = "${electron}/bin";
        ELECTRON_EXEC_PATH = "${electron}/bin/electron";
        NODE_OPTIONS = "--max-old-space-size=4096";
      };
    };
}
