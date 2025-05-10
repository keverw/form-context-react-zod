// Build script for form-context-react-zod library
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import * as esbuild from 'esbuild';

// Package configuration
const PACKAGE_CONFIG = {
  name: 'form-context-react-zod',
  version: '1.0.9',
  description: 'React form context with Zod validation helpers',
  author: '',
  license: 'MIT',
  repository: 'https://github.com/keverw/form-context-react-zod',
};

// Clean dist_module directory
console.log('Cleaning dist_module directory...');
if (fs.existsSync('dist_module')) {
  try {
    // Remove the entire directory and its contents
    fs.rmSync('dist_module', { recursive: true, force: true });
    console.log('✅ Cleaned dist_module directory');
  } catch (error) {
    console.error('❌ Error cleaning dist_module directory:', error);
    process.exit(1);
  }
}

// Ensure dist_module directory exists
if (!fs.existsSync('dist_module')) {
  fs.mkdirSync('dist_module', { recursive: true });
}

async function build() {
  try {
    console.log('Building with esbuild...');

    // Build ESM version
    await esbuild.build({
      entryPoints: ['src/lib/index.ts'],
      bundle: true,
      outfile: 'dist_module/index.js',
      format: 'esm',
      platform: 'neutral',
      external: ['react', 'react-dom', 'zod'],
      sourcemap: true,
      minify: true,
      target: 'es2019',
      jsx: 'automatic',
    });

    // Build CJS version
    await esbuild.build({
      entryPoints: ['src/lib/index.ts'],
      bundle: true,
      outfile: 'dist_module/index.cjs',
      format: 'cjs',
      platform: 'neutral',
      external: ['react', 'react-dom', 'zod'],
      sourcemap: true,
      minify: true,
      target: 'es2019',
      jsx: 'automatic',
    });

    console.log('✅ JavaScript bundles built successfully');

    // Generate TypeScript declaration files
    console.log('Generating TypeScript declarations...');
    try {
      // Use the locally installed typescript compiler directly
      execSync(
        'node ./node_modules/typescript/bin/tsc --project tsconfig.lib.json --emitDeclarationOnly',
        {
          stdio: 'inherit',
        }
      );
      
      // Post-process TypeScript declarations - fix the index.d.ts file
      console.log('Post-processing TypeScript declarations...');
      
      try {
        // Read all the declaration files to extract their exports
        const formContextTypes = fs.readFileSync('dist_module/form-context.d.ts', 'utf8');
        const zodHelpersTypes = fs.readFileSync('dist_module/zod-helpers.d.ts', 'utf8');
        const useFormContextTypes = fs.readFileSync('dist_module/hooks/useFormContext.d.ts', 'utf8');
        const useFieldTypes = fs.readFileSync('dist_module/hooks/useField.d.ts', 'utf8');
        const useArrayFieldTypes = fs.readFileSync('dist_module/hooks/useArrayField.d.ts', 'utf8');
        const formStateTypes = fs.readFileSync('dist_module/components/FormState.d.ts', 'utf8');
        
        // Process the files to inline their content and remove imports
        const processTypeFile = (content) => {
          // Remove import statements
          let processed = content.replace(/import .+ from ['|"].+['|"];\n/g, '');

          // Replace relative paths in type references with their proper names
          processed = processed.replace(/['|"]\.\/zod-helpers['|"]/g, '""');
          processed = processed.replace(/['|"]\.\/form-context['|"]/g, '""');
          processed = processed.replace(/['|"]\.\/utils['|"]/g, '""');
          processed = processed.replace(/['|"]\.\.\/.+['|"]/g, '""');

          // Remove any empty exports (export {};) that are just module markers
          processed = processed.replace(/export \{\};\n?/g, '');
          return processed;
        };
        
        // Generate a new index.d.ts file with all needed types
        const indexDtsContent = 
`import React from 'react';
import { z } from 'zod';

// Zod Helpers
${processTypeFile(zodHelpersTypes)}

// Form Context
${processTypeFile(formContextTypes)}

// Hooks
${processTypeFile(useFormContextTypes)}
${processTypeFile(useFieldTypes)}
${processTypeFile(useArrayFieldTypes)}

// Components
${processTypeFile(formStateTypes)}
`;
        
        // Write the new index.d.ts file
        fs.writeFileSync('dist_module/index.d.ts', indexDtsContent);
        
        // Clean up individual .d.ts files since they're now combined into index.d.ts
        console.log('Cleaning up individual declaration files...');
        try {
          // Remove form-context.d.ts and other root level .d.ts files except index.d.ts
          const rootDtsFiles = fs.readdirSync('dist_module')
            .filter(file => file.endsWith('.d.ts') && file !== 'index.d.ts');
          
          for (const file of rootDtsFiles) {
            fs.unlinkSync(`dist_module/${file}`);
          }
          
          // Remove .d.ts files in subdirectories
          const cleanDir = (dir) => {
            if (fs.existsSync(`dist_module/${dir}`)) {
              const files = fs.readdirSync(`dist_module/${dir}`)
                .filter(file => file.endsWith('.d.ts'));
                
              for (const file of files) {
                fs.unlinkSync(`dist_module/${dir}/${file}`);
              }
              
              // If directory is now empty, remove it
              if (fs.readdirSync(`dist_module/${dir}`).length === 0) {
                fs.rmdirSync(`dist_module/${dir}`);
              }
            }
          };
          
          // Clean up known subdirectories
          cleanDir('hooks');
          cleanDir('components');
          
          console.log('✅ Declaration files cleanup complete');
        } catch (cleanupError) {
          console.error('Error cleaning up declaration files:', cleanupError);
        }
      } catch (error) {
        console.error('Error during TypeScript declarations post-processing:', error);
      }
      
      console.log('✅ TypeScript declarations generated successfully');
    } catch (error) {
      console.error('❌ Error generating TypeScript declarations:', error);
      // Continue anyway, as we have the JS bundles
    }

    // Copy documentation files
    console.log('Copying documentation files...');
    try {
      // Copy ZOD-HELPERS.md
      if (fs.existsSync('ZOD-HELPERS.md')) {
        fs.copyFileSync('ZOD-HELPERS.md', 'dist_module/ZOD-HELPERS.md');
      }

      // Copy FORM-API.md
      if (fs.existsSync('FORM-API.md')) {
        fs.copyFileSync('FORM-API.md', 'dist_module/FORM-API.md');
      }

      console.log('✅ Documentation files copied successfully');
    } catch (error) {
      console.error('❌ Error copying documentation files:', error);
      // Continue anyway
    }

    // Create package.json for the library
    console.log('Creating package.json for publishing...');
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

    // Modify package.json for the library
    const libPackageJson = {
      name: PACKAGE_CONFIG.name,
      version: PACKAGE_CONFIG.version,
      description: PACKAGE_CONFIG.description,
      main: 'index.cjs',
      module: 'index.js',
      types: 'index.d.ts',
      type: 'module',
      files: [
        'index.js',
        'index.cjs',
        'index.d.ts',
        'README.md',
        'FORM-API.md',
        'ZOD-HELPERS.md',
      ],
      keywords: ['react', 'form', 'zod', 'validation', 'context'],
      author: packageJson.author || '',
      license: PACKAGE_CONFIG.license,
      peerDependencies: {
        react: '^18.0.0',
        'react-dom': '^18.0.0',
        zod: '^3.0.0',
      },
      dependencies: {},
      repository: PACKAGE_CONFIG.repository,
      exports: {
        '.': {
          import: './index.js',
          require: './index.cjs',
          types: './index.d.ts',
        },
      },
    };

    fs.writeFileSync(
      path.join('dist_module', 'package.json'),
      JSON.stringify(libPackageJson, null, 2)
    );

    // Create README.md with references to documentation
    console.log('Creating README.md...');
    const readme = `# ${PACKAGE_CONFIG.name}

${PACKAGE_CONFIG.description}

Current version: ${PACKAGE_CONFIG.version}

## Demo

Check out the [live demo](https://keverw.github.io/form-context-react-zod/) to see the library in action.

## Installation

\`\`\`bash
npm install ${PACKAGE_CONFIG.name}
\`\`\`

## Features

- Type-safe form handling with Zod schemas
- Nested form support
- Array field management
- Client and server-side validation
- React hooks for form state management

## Usage

\`\`\`tsx
import { FormProvider, useForm, zodHelpers } from '${PACKAGE_CONFIG.name}';

// Basic example
const MyForm = () => {
  const schema = z.object({
    name: z.string().min(2),
    email: z.string().email()
  });

  return (
    <FormProvider schema={schema} onSubmit={values => console.log(values)}>
      <FormField name="name" />
      <FormField name="email" />
      <button type="submit">Submit</button>
    </FormProvider>
  );
};
\`\`\`

## Debugging

### FormState

The \`FormState\` component is a developer tool for inspecting the current form state, errors, and touched fields.

**Usage:**

\`\`\`tsx
import { FormState } from '${PACKAGE_CONFIG.name}';

<FormState showToggle />
\`\`\`

- Use the \`showToggle\` prop to allow switching between light and dark mode.
- This component is intended for development and debugging purposes.

## Documentation

For detailed documentation, see:

- [Form API Documentation](https://github.com/keverw/form-context-react-zod/blob/master/FORM-API.md)
- [Zod Helpers Documentation](https://github.com/keverw/form-context-react-zod/blob/master/ZOD-HELPERS.md)

## License

${PACKAGE_CONFIG.license}

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by React or Zod. All product names, logos, and brands are property of their respective owners.
`;

    fs.writeFileSync(path.join('dist_module', 'README.md'), readme);

    console.log(
      '✅ Library build complete! Your package is ready in the dist_module directory.'
    );
    console.log('To publish:');
    console.log('1. Run npm run publish:lib');
    console.log('   OR');
    console.log('2. cd dist_module && npm publish');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
