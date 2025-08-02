import unittest
import os
from ptabler.workflow import PWorkflow
from ptabler.steps import GlobalSettings, ReadCsv, ReadNdjson, WriteCsv, WriteNdjson, AddColumns
from ptabler.steps.basics import ColumnDefinition
from ptabler.expression import ColumnReferenceExpression, StructFieldExpression

current_script_dir = os.path.dirname(os.path.abspath(__file__))
test_data_root_dir = os.path.join(
    os.path.dirname(os.path.dirname(current_script_dir)),
    "test_data")
global_settings = GlobalSettings(root_folder=test_data_root_dir)

class NdjsonTest(unittest.TestCase):

    def test_workflow_read_ndjson_write_csv(self):
        """Test reading NDJSON file and writing to CSV"""
        input_file_relative_path = "test_data_1.ndjson"
        output_file_relative_path = "output_ndjson_to_csv.csv"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadNdjson(
            file=input_file_relative_path,
            name="input_table_from_ndjson"
        )

        write_step = WriteCsv(
            table="input_table_from_ndjson",
            file=f"outputs/{output_file_relative_path}",
            columns=["id", "name", "value1", "category"]
        )

        ptw = PWorkflow(workflow=[read_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_workflow_read_csv_write_ndjson(self):
        """Test reading CSV file and writing to NDJSON"""
        input_file_relative_path = "test_data_1.tsv"
        output_file_relative_path = "output_csv_to_ndjson.ndjson"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadCsv(
            file=input_file_relative_path,
            name="input_table_from_csv",
            delimiter="\t"
        )

        write_step = WriteNdjson(
            table="input_table_from_csv",
            file=f"outputs/{output_file_relative_path}",
            columns=["id", "name", "value1", "category"]
        )

        ptw = PWorkflow(workflow=[read_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_ndjson_n_rows_functionality(self):
        """Test nRows parameter limits the number of rows read from NDJSON"""
        input_file_relative_path = "test_data_1.ndjson"
        output_file_relative_path = "output_ndjson_limited_rows.csv"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadNdjson(
            file=input_file_relative_path,
            name="limited_table_from_ndjson",
            n_rows=3  # Should only read first 3 rows
        )

        write_step = WriteCsv(
            table="limited_table_from_ndjson",
            file=f"outputs/{output_file_relative_path}",
            columns=["id", "name", "category", "value1", "value2", "is_active"]
        )

        ptw = PWorkflow(workflow=[read_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")
            
            # Read the output file and verify it has exactly 3 data rows (plus header)
            with open(output_file_abs_path, 'r') as f:
                lines = f.readlines()
                # Should have header + 3 data rows = 4 total lines
                self.assertEqual(len(lines), 4, 
                               f"Expected 4 lines (header + 3 data rows), got {len(lines)}")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_csv_n_rows_functionality(self):
        """Test nRows parameter limits the number of rows read from CSV"""
        input_file_relative_path = "test_data_1.tsv"
        output_file_relative_path = "output_csv_limited_rows.csv"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadCsv(
            file=input_file_relative_path,
            name="limited_table_from_csv",
            delimiter="\t",
            n_rows=2  # Should only read first 2 rows
        )

        write_step = WriteCsv(
            table="limited_table_from_csv",
            file=f"outputs/{output_file_relative_path}"
        )

        ptw = PWorkflow(workflow=[read_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")
            
            # Read the output file and verify it has exactly 2 data rows (plus header)  
            with open(output_file_abs_path, 'r') as f:
                lines = f.readlines()
                # Should have header + 2 data rows = 3 total lines
                self.assertEqual(len(lines), 3, 
                               f"Expected 3 lines (header + 2 data rows), got {len(lines)}")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_ndjson_roundtrip(self):
        """Test reading NDJSON, writing NDJSON - roundtrip test"""
        input_file_relative_path = "test_data_1.ndjson"
        output_file_relative_path = "output_ndjson_roundtrip.ndjson"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadNdjson(
            file=input_file_relative_path,
            name="roundtrip_table"
        )

        write_step = WriteNdjson(
            table="roundtrip_table",
            file=f"outputs/{output_file_relative_path}"
        )

        ptw = PWorkflow(workflow=[read_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")
            
            # Verify the output file has content
            with open(output_file_abs_path, 'r') as f:
                lines = f.readlines()
                self.assertGreater(len(lines), 0, "Output file should not be empty")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_struct_field_single_extraction(self):
        """Test extracting single fields from nested structures"""
        input_file_relative_path = "test_data_1.ndjson"
        output_file_relative_path = "output_struct_single_field.csv"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadNdjson(
            file=input_file_relative_path,
            name="input_data"
        )

        # Add columns that extract single fields from nested structures
        add_columns_step = AddColumns(
            table="input_data",
            columns=[
                ColumnDefinition(
                    name="created_by",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="metadata"),
                        fields="created_by"
                    )
                ),
                ColumnDefinition(
                    name="country",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="location"),
                        fields="country"
                    )
                ),
                ColumnDefinition(
                    name="city",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="location"),
                        fields="city"
                    )
                )
            ]
        )

        write_step = WriteCsv(
            table="input_data",
            file=f"outputs/{output_file_relative_path}",
            columns=["id", "name", "created_by", "country", "city"]
        )

        ptw = PWorkflow(workflow=[read_step, add_columns_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")

            # Read and verify the output file
            with open(output_file_abs_path, 'r') as f:
                content = f.read()
                # Should contain extracted nested field data
                self.assertIn("user1", content, "Should extract created_by field")
                self.assertIn("USA", content, "Should extract country field")
                self.assertIn("New York", content, "Should extract city field")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_struct_field_individual_extraction(self):
        """Test extracting individual fields from the same nested structure"""
        input_file_relative_path = "test_data_1.ndjson"
        output_file_relative_path = "output_struct_individual_fields.ndjson"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadNdjson(
            file=input_file_relative_path,
            name="input_data"
        )

        # Add columns that extract multiple fields from same struct
        add_columns_step = AddColumns(
            table="input_data",
            columns=[
                ColumnDefinition(
                    name="location_country",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="location"),
                        fields="country"
                    )
                ),
                ColumnDefinition(
                    name="location_city",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="location"),
                        fields="city"
                    )
                )
            ]
        )

        write_step = WriteNdjson(
            table="input_data",
            file=f"outputs/{output_file_relative_path}",
            columns=["id", "name", "location_country", "location_city"]
        )

        ptw = PWorkflow(workflow=[read_step, add_columns_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")

            # Read and verify the output file
            with open(output_file_abs_path, 'r') as f:
                content = f.read()
                # Should contain struct data with multiple fields extracted separately
                self.assertIn("location_country", content, "Should have location_country column")
                self.assertIn("location_city", content, "Should have location_city column")
                self.assertIn("USA", content, "Should extract country values")
                self.assertIn("New York", content, "Should extract city values")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_struct_field_nested_access(self):
        """Test accessing deeply nested fields"""
        input_file_relative_path = "test_data_1.ndjson"
        output_file_relative_path = "output_struct_nested_access.csv"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadNdjson(
            file=input_file_relative_path,
            name="input_data"
        )

        # Extract individual lat/lng from deeply nested structure
        add_columns_step = AddColumns(
            table="input_data",
            columns=[
                ColumnDefinition(
                    name="latitude",
                    expression=StructFieldExpression(
                        struct=StructFieldExpression(
                            struct=ColumnReferenceExpression(name="location"),
                            fields="coordinates"
                        ),
                        fields="lat"
                    )
                ),
                ColumnDefinition(
                    name="longitude",
                    expression=StructFieldExpression(
                        struct=StructFieldExpression(
                            struct=ColumnReferenceExpression(name="location"),
                            fields="coordinates"
                        ),
                        fields="lng"
                    )
                )
            ]
        )

        write_step = WriteCsv(
            table="input_data",
            file=f"outputs/{output_file_relative_path}",
            columns=["id", "name", "latitude", "longitude"]
        )

        ptw = PWorkflow(workflow=[read_step, add_columns_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")

            # Read and verify the output file
            with open(output_file_abs_path, 'r') as f:
                content = f.read()
                # Should contain extracted coordinate data
                self.assertIn("40.7128", content, "Should extract latitude")
                self.assertIn("-74.006", content, "Should extract longitude")  # Note: CSV may truncate precision

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_struct_field_missing_fields(self):
        """Test behavior when struct fields are missing in some records"""
        input_file_relative_path = "test_data_1.ndjson"
        output_file_relative_path = "output_struct_missing_fields.csv"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadNdjson(
            file=input_file_relative_path,
            name="input_data"
        )

        # Extract fields that are missing in some records (only scalar values for CSV)
        add_columns_step = AddColumns(
            table="input_data",
            columns=[
                ColumnDefinition(
                    name="timestamp",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="metadata"),
                        fields="timestamp"
                    )
                ),
                ColumnDefinition(
                    name="created_by",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="metadata"),
                        fields="created_by"
                    )
                )
            ]
        )

        write_step = WriteCsv(
            table="input_data",
            file=f"outputs/{output_file_relative_path}",
            columns=["id", "name", "timestamp", "created_by"]
        )

        ptw = PWorkflow(workflow=[read_step, add_columns_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")

            # Read and verify the output file handles missing fields gracefully
            with open(output_file_abs_path, 'r') as f:
                lines = f.readlines()
                self.assertGreater(len(lines), 1, "Should have header and data")
                # Should process all records even with missing fields
                self.assertEqual(len(lines), 9, "Should have 8 data rows + header")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_struct_field_missing_entire_struct(self):
        """Test behavior when entire struct object is missing"""
        input_file_relative_path = "test_data_1.ndjson"
        output_file_relative_path = "output_struct_missing_object.csv"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadNdjson(
            file=input_file_relative_path,
            name="input_data"
        )

        # Try to extract from metadata which is completely missing in record 4
        add_columns_step = AddColumns(
            table="input_data",
            columns=[
                ColumnDefinition(
                    name="created_by_from_missing_struct",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="metadata"),
                        fields="created_by"
                    )
                )
            ]
        )

        write_step = WriteCsv(
            table="input_data",
            file=f"outputs/{output_file_relative_path}",
            columns=["id", "name", "created_by_from_missing_struct"]
        )

        ptw = PWorkflow(workflow=[read_step, add_columns_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")

            # Should handle missing entire struct gracefully
            with open(output_file_abs_path, 'r') as f:
                lines = f.readlines()
                self.assertEqual(len(lines), 9, "Should process all records including those with missing structs")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_struct_field_coordinates_with_missing_data(self):
        """Test extracting coordinates struct when it's missing in some records"""
        input_file_relative_path = "test_data_1.ndjson"
        output_file_relative_path = "output_struct_coordinates_missing.ndjson"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadNdjson(
            file=input_file_relative_path,
            name="input_data"
        )

        # Extract coordinates struct that is missing in some records
        add_columns_step = AddColumns(
            table="input_data",
            columns=[
                ColumnDefinition(
                    name="coordinates_data",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="location"),
                        fields="coordinates"
                    )
                )
            ]
        )

        write_step = WriteNdjson(
            table="input_data",
            file=f"outputs/{output_file_relative_path}",
            columns=["id", "name", "coordinates_data"]
        )

        ptw = PWorkflow(workflow=[read_step, add_columns_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")

            # Read and verify the output file handles missing struct fields gracefully
            with open(output_file_abs_path, 'r') as f:
                lines = f.readlines()
                self.assertGreater(len(lines), 1, "Should have data")
                # Should process all records even with missing coordinates
                self.assertEqual(len(lines), 8, "Should have 8 data rows")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_struct_field_deeply_nested_nonexistent_fields(self):
        """Test behavior when trying to access deeply nested fields from non-existent root fields"""
        input_file_relative_path = "test_data_1.ndjson"
        output_file_relative_path = "output_struct_deeply_nested_nonexistent.csv"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadNdjson(
            file=input_file_relative_path,
            name="input_data"
        )

        # Try to extract deeply nested fields from completely non-existent root fields
        add_columns_step = AddColumns(
            table="input_data",
            columns=[
                ColumnDefinition(
                    name="deeply_nested_nonexistent",
                    expression=StructFieldExpression(
                        struct=StructFieldExpression(
                            struct=StructFieldExpression(
                                struct=ColumnReferenceExpression(name="location"),
                                fields="evenMoreNonExistentField"
                            ),
                            fields="andNestedNonExistentField"
                        ),
                        fields="finalNonExistentField"
                    )
                ),
                ColumnDefinition(
                    name="mixed_existing_nonexistent",
                    expression=StructFieldExpression(
                        struct=StructFieldExpression(
                            struct=ColumnReferenceExpression(name="metadata"),  # This exists
                            fields="nonExistentSubField"  # But this doesn't
                        ),
                        fields="evenDeeperNonExistent"  # And this definitely doesn't
                    )
                )
            ]
        )

        write_step = WriteCsv(
            table="input_data",
            file=f"outputs/{output_file_relative_path}",
            columns=["id", "name", "deeply_nested_nonexistent", "mixed_existing_nonexistent"]
        )

        ptw = PWorkflow(workflow=[read_step, add_columns_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")

            # Read and verify the output file handles deeply nested non-existent fields gracefully
            with open(output_file_abs_path, 'r') as f:
                lines = f.readlines()
                self.assertGreater(len(lines), 1, "Should have header and data")
                # Should process all records even with deeply nested non-existent fields
                self.assertEqual(len(lines), 9, "Should have 8 data rows + header")
                
                # Verify that the content contains the expected column headers
                header = lines[0].strip()
                self.assertIn("deeply_nested_nonexistent", header, "Should have deeply_nested_nonexistent column")
                self.assertIn("mixed_existing_nonexistent", header, "Should have mixed_existing_nonexistent column")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_struct_field_recursive_array_access(self):
        """Test recursive field access using arrays instead of nested StructFieldExpression calls"""
        input_file_relative_path = "test_data_1.ndjson"
        output_file_relative_path = "output_struct_recursive_array.csv"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadNdjson(
            file=input_file_relative_path,
            name="input_data"
        )

        # Use recursive field access with arrays instead of nested StructFieldExpression calls
        add_columns_step = AddColumns(
            table="input_data",
            columns=[
                ColumnDefinition(
                    name="latitude_array_access",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="location"),
                        fields=["coordinates", "lat"]  # Array for recursive access
                    )
                ),
                ColumnDefinition(
                    name="longitude_array_access",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="location"),
                        fields=["coordinates", "lng"]  # Array for recursive access
                    )
                )
            ]
        )

        write_step = WriteCsv(
            table="input_data",
            file=f"outputs/{output_file_relative_path}",
            columns=["id", "name", "latitude_array_access", "longitude_array_access"]
        )

        ptw = PWorkflow(workflow=[read_step, add_columns_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")

            # Read and verify the output file
            with open(output_file_abs_path, 'r') as f:
                content = f.read()
                # Should contain extracted coordinate data using array access
                self.assertIn("40.7128", content, "Should extract latitude using array access")
                self.assertIn("-74.006", content, "Should extract longitude using array access")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_struct_field_default_values(self):
        """Test default values when fields are missing"""
        input_file_relative_path = "test_data_1.ndjson"
        output_file_relative_path = "output_struct_defaults.csv"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadNdjson(
            file=input_file_relative_path,
            name="input_data"
        )

        # Extract fields with default values for missing data
        add_columns_step = AddColumns(
            table="input_data",
            columns=[
                ColumnDefinition(
                    name="timestamp_with_default",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="metadata"),
                        fields="timestamp",
                        default="2023-01-01T00:00:00Z"  # String default
                    )
                ),
                ColumnDefinition(
                    name="missing_field_with_default",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="metadata"),
                        fields="nonexistent_field",
                        default="default_value"  # String default for missing field
                    )
                ),
                ColumnDefinition(
                    name="missing_numeric_with_default",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="location"),
                        fields="elevation",  # This field doesn't exist
                        default=0  # Numeric default
                    )
                ),
                ColumnDefinition(
                    name="missing_bool_with_default",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="metadata"),
                        fields="is_verified",  # This field doesn't exist
                        default=False  # Boolean default
                    )
                )
            ]
        )

        write_step = WriteCsv(
            table="input_data",
            file=f"outputs/{output_file_relative_path}",
            columns=["id", "name", "timestamp_with_default", "missing_field_with_default", 
                    "missing_numeric_with_default", "missing_bool_with_default"]
        )

        ptw = PWorkflow(workflow=[read_step, add_columns_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")

            # Read and verify the output file
            with open(output_file_abs_path, 'r') as f:
                content = f.read()
                # Should contain default values for missing fields
                self.assertIn("2023-01-01T00:00:00Z", content, "Should use string default for missing timestamp")
                self.assertIn("default_value", content, "Should use string default for missing field")
                self.assertIn("0", content, "Should use numeric default for missing elevation")
                self.assertIn("false", content, "Should use boolean default for missing field")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_struct_field_recursive_array_with_defaults(self):
        """Test recursive array access with default values for deeply nested missing fields"""
        input_file_relative_path = "test_data_1.ndjson"
        output_file_relative_path = "output_struct_recursive_defaults.csv"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadNdjson(
            file=input_file_relative_path,
            name="input_data"
        )

        # Use recursive field access with defaults for missing nested fields
        add_columns_step = AddColumns(
            table="input_data",
            columns=[
                ColumnDefinition(
                    name="altitude_with_default",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="location"),
                        fields=["coordinates", "altitude"],  # This nested field doesn't exist
                        default=100.0  # Numeric default for missing deeply nested field
                    )
                ),
                ColumnDefinition(
                    name="deep_missing_with_default",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="location"),
                        fields=["nonexistent", "also_missing", "deeply_missing"],  # All missing
                        default="not_found"  # String default for completely missing path
                    )
                )
            ]
        )

        write_step = WriteCsv(
            table="input_data",
            file=f"outputs/{output_file_relative_path}",
            columns=["id", "name", "altitude_with_default", "deep_missing_with_default"]
        )

        ptw = PWorkflow(workflow=[read_step, add_columns_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")

            # Read and verify the output file
            with open(output_file_abs_path, 'r') as f:
                content = f.read()
                # Should contain default values for missing nested fields
                self.assertIn("100.0", content, "Should use numeric default for missing nested altitude")
                self.assertIn("not_found", content, "Should use string default for completely missing nested path")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_struct_field_dtype_casting(self):
        """Test dtype casting for extracted fields"""
        input_file_relative_path = "test_data_1.ndjson"
        output_file_relative_path = "output_struct_dtype_casting.csv"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadNdjson(
            file=input_file_relative_path,
            name="input_data"
        )

        # Extract fields with specific data type casting
        add_columns_step = AddColumns(
            table="input_data",
            columns=[
                ColumnDefinition(
                    name="latitude_as_string",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="location"),
                        fields=["coordinates", "lat"],
                        dtype="String"  # Cast numeric to string
                    )
                ),
                ColumnDefinition(
                    name="created_by_as_string",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="metadata"),
                        fields="created_by",  # Single field access with casting
                        dtype="String"  # Cast to string
                    )
                ),
                ColumnDefinition(
                    name="country_as_string",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="location"),
                        fields="country",  # Extract country from location struct
                        dtype="String"  # Cast to string
                    )
                )
            ]
        )

        write_step = WriteCsv(
            table="input_data",
            file=f"outputs/{output_file_relative_path}",
            columns=["id", "name", "latitude_as_string", "created_by_as_string", "country_as_string"]
        )

        ptw = PWorkflow(workflow=[read_step, add_columns_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")

            # Read and verify the output file
            with open(output_file_abs_path, 'r') as f:
                lines = f.readlines()
                self.assertGreater(len(lines), 1, "Should have header and data")
                # Should process all records with proper type casting
                self.assertEqual(len(lines), 9, "Should have 8 data rows + header")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_struct_field_combined_features(self):
        """Test combining recursive array access, default values, and dtype casting"""
        input_file_relative_path = "test_data_1.ndjson"
        output_file_relative_path = "output_struct_combined_features.csv"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadNdjson(
            file=input_file_relative_path,
            name="input_data"
        )

        # Combine all new features: recursive access + defaults + dtype casting
        add_columns_step = AddColumns(
            table="input_data",
            columns=[
                ColumnDefinition(
                    name="combined_feature_test",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="location"),
                        fields=["details", "population"],  # Recursive access to missing nested field
                        default=1000000,  # Numeric default
                        dtype="Int64"  # Cast to integer
                    )
                ),
                ColumnDefinition(
                    name="string_combined_test",
                    expression=StructFieldExpression(
                        struct=ColumnReferenceExpression(name="metadata"),
                        fields=["info", "description"],  # Recursive access to missing nested field
                        default="No description available",  # String default
                        dtype="String"  # Cast to string
                    )
                )
            ]
        )

        write_step = WriteCsv(
            table="input_data",
            file=f"outputs/{output_file_relative_path}",
            columns=["id", "name", "combined_feature_test", "string_combined_test"]
        )

        ptw = PWorkflow(workflow=[read_step, add_columns_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")

            # Read and verify the output file
            with open(output_file_abs_path, 'r') as f:
                content = f.read()
                # Should contain default values with proper type casting
                self.assertIn("1000000", content, "Should use numeric default with integer casting")
                self.assertIn("No description available", content, "Should use string default with string casting")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)


if __name__ == '__main__':
    unittest.main()